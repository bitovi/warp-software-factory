import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseDuration,
  parseTime,
  validDate,
  validateDraft,
  weekStart,
} from './entry-rules';
import { DEMO_CONTEXT } from './timesheet-gateway';
import { type EntryDraft, type TimeEntry } from './timesheet-model';

const draft: EntryDraft = {
  projectId: 'website',
  serviceId: 'development',
  date: '2026-11-09',
  duration: '1:30',
  start: '',
  end: '',
  description: 'Build search',
  billable: true,
};

test('duration accepts clock, decimal hours, and minutes as whole minutes', () => {
  for (const [value, expected] of [
    ['1:30', 90],
    ['1.5', 90],
    ['90m', 90],
    [' .5 ', 30],
    ['1.5H', 90],
    ['0:01', 1],
    ['1.1', 66],
  ] as const) {
    assert.equal(parseDuration(value), expected, value);
  }
  for (const value of [
    '',
    '0',
    '-1',
    '1:60',
    '1:3',
    '1e2',
    '90 minutes',
    '1.001',
    '0.5m',
    '1.0000001m',
    'Infinity',
    '1.5junk',
    '9007199254740992m',
  ]) {
    assert.equal(parseDuration(value), null, value);
  }
});

test('dates reject rollover and times reject noncanonical values', () => {
  assert.equal(validDate('2024-02-29'), true);
  for (const value of [
    '2026-02-29',
    '2026-04-31',
    '2026-1-01',
    '2026-13-01',
    '',
    '2026-11-09T00:00Z',
  ]) {
    assert.equal(validDate(value), false, value);
  }
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
  assert.equal(weekStart('2026-01-01'), '2025-12-29');
  assert.equal(parseTime('23:59'), 1439);
  for (const value of ['24:00', '9:00', '12:60', '12:00:30', ''])
    assert.equal(parseTime(value), null);
});

test('rounding, required fields, project eligibility, and services use supplied policy', () => {
  assert.equal(
    validateDraft({ ...draft, duration: '91m' }, DEMO_CONTEXT, []).input
      ?.minutes,
    105,
  );
  const context = structuredClone(DEMO_CONTEXT);
  context.rules = {
    roundingMinutes: 6,
    maxMinutesPerDay: 600,
    requireDescription: false,
    lockedBefore: null,
  };
  assert.equal(
    validateDraft(
      { ...draft, duration: '91m', description: '', date: '2025-12-31' },
      context,
      [],
    ).input?.minutes,
    96,
  );
  assert.ok(
    validateDraft({ ...draft, description: '  ' }, DEMO_CONTEXT, []).errors
      .description,
  );
  assert.ok(
    validateDraft({ ...draft, projectId: 'archived' }, DEMO_CONTEXT, []).errors
      .projectId,
  );
  assert.ok(
    validateDraft({ ...draft, projectId: 'unassigned' }, DEMO_CONTEXT, [])
      .errors.projectId,
  );
  assert.ok(
    validateDraft({ ...draft, serviceId: 'discovery' }, DEMO_CONTEXT, []).errors
      .serviceId,
  );
  context.services[0]!.active = false;
  assert.ok(validateDraft(draft, context, []).errors.serviceId);
});

test('daily caps include unfiltered entries and rounded duration but exclude the edited entry', () => {
  const input = validateDraft(draft, DEMO_CONTEXT, []).input!;
  const entry: TimeEntry = {
    ...input,
    id: 'existing',
    approved: false,
    minutes: 390,
    projectId: 'research',
  };
  assert.ok(
    validateDraft({ ...draft, duration: '91m' }, DEMO_CONTEXT, [entry]).errors
      .duration,
  );
  assert.equal(validateDraft(draft, DEMO_CONTEXT, [entry]).input?.minutes, 90);
  assert.equal(
    validateDraft({ ...draft, duration: '8' }, DEMO_CONTEXT, [entry], entry)
      .input?.minutes,
    480,
  );
  assert.ok(
    validateDraft({ ...draft, duration: '25' }, DEMO_CONTEXT, []).errors
      .duration,
  );
});

test('optional time pairs must match raw duration before rounding', () => {
  const withTimes = { ...draft, duration: '91m', start: '09:00', end: '10:31' };
  assert.equal(validateDraft(withTimes, DEMO_CONTEXT, []).input?.minutes, 105);
  assert.ok(
    validateDraft({ ...withTimes, end: '' }, DEMO_CONTEXT, []).errors.end,
  );
  assert.ok(
    validateDraft({ ...withTimes, start: '' }, DEMO_CONTEXT, []).errors.start,
  );
  assert.ok(
    validateDraft({ ...withTimes, end: '08:00' }, DEMO_CONTEXT, []).errors.end,
  );
  assert.ok(
    validateDraft({ ...withTimes, duration: '90m' }, DEMO_CONTEXT, []).errors
      .duration,
  );
});

test('approved and locked entries cannot be edited; rate snapshots stay stable for the same service', () => {
  const input = validateDraft(draft, DEMO_CONTEXT, []).input!;
  const entry: TimeEntry = {
    ...input,
    id: 'existing',
    approved: false,
    rateSnapshot: { hourlyRate: 80, currency: 'USD' },
  };
  assert.equal(
    validateDraft(draft, DEMO_CONTEXT, [entry], entry).input?.rateSnapshot
      .hourlyRate,
    80,
  );
  assert.equal(
    validateDraft(
      { ...draft, serviceId: 'design' },
      DEMO_CONTEXT,
      [entry],
      entry,
    ).input?.rateSnapshot.hourlyRate,
    110,
  );
  assert.ok(
    validateDraft(draft, DEMO_CONTEXT, [entry], { ...entry, approved: true })
      .errors.form,
  );
  assert.ok(
    validateDraft(draft, DEMO_CONTEXT, [entry], {
      ...entry,
      date: '2025-12-31',
    }).errors.form,
  );
  assert.ok(
    validateDraft({ ...draft, date: '2025-12-31' }, DEMO_CONTEXT, []).errors
      .date,
  );
});
