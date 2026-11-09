import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Injector } from '@angular/core';
import { saveErrors, validateDraft } from './entry-rules';
import {
  DEMO_CONTEXT,
  DemoTimesheetGateway,
  TimesheetGateway,
} from './timesheet-gateway';
import {
  EntryValidationError,
  type DateRange,
  type EntryDraft,
  type EntryInput,
  type TimeEntry,
} from './timesheet-model';
import { TimesheetStore } from './timesheet-store';

const range = { from: '2026-11-09', to: '2026-11-15' };
const draft: EntryDraft = {
  projectId: 'website',
  serviceId: 'development',
  date: range.from,
  duration: '1.5',
  start: '',
  end: '',
  description: 'Build search',
  billable: true,
};
const input = validateDraft(draft, DEMO_CONTEXT, []).input!;
const entry = (id: string, changes: Partial<TimeEntry> = {}): TimeEntry => ({
  ...input,
  id,
  approved: false,
  ...changes,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class ControlledGateway extends TimesheetGateway {
  rows: TimeEntry[] = [];
  lists: Array<ReturnType<typeof deferred<TimeEntry[]>>> = [];
  creates: Array<
    { input: EntryInput } & ReturnType<typeof deferred<TimeEntry>>
  > = [];
  updates: Array<
    { id: string; input: EntryInput } & ReturnType<typeof deferred<TimeEntry>>
  > = [];
  deletes: Array<{ id: string } & ReturnType<typeof deferred<void>>> = [];
  deferLists = false;
  failContext = false;
  async context() {
    if (this.failContext) throw new Error('Unavailable');
    return structuredClone(DEMO_CONTEXT);
  }
  async list(request: DateRange) {
    if (!this.deferLists)
      return structuredClone(
        this.rows.filter(
          (item) => item.date >= request.from && item.date <= request.to,
        ),
      );
    const pending = deferred<TimeEntry[]>();
    this.lists.push(pending);
    return pending.promise;
  }
  create(value: EntryInput) {
    const pending = { input: value, ...deferred<TimeEntry>() };
    this.creates.push(pending);
    return pending.promise;
  }
  update(id: string, value: EntryInput) {
    const pending = { id, input: value, ...deferred<TimeEntry>() };
    this.updates.push(pending);
    return pending.promise;
  }
  delete(id: string) {
    const pending = { id, ...deferred<void>() };
    this.deletes.push(pending);
    return pending.promise;
  }
}

async function setup(rows: TimeEntry[] = []) {
  const gateway = new ControlledGateway();
  gateway.rows = rows;
  const injector = Injector.create({
    providers: [
      TimesheetStore,
      { provide: TimesheetGateway, useValue: gateway },
    ],
  });
  const store = injector.get(TimesheetStore);
  await store.load(range);
  return { store, gateway, injector };
}

test('optimistic creates reconcile IDs, totals, and remembered defaults only after success', async () => {
  const { store, gateway, injector } = await setup();
  try {
    const saved = store.save(draft);
    assert.equal(store.totalMinutes(), 90);
    assert.equal(store.pending().size, 1);
    assert.match(store.entries()[0]!.id, /^pending-/);
    const response = entry('server-id');
    gateway.creates[0]!.resolve(response);
    assert.deepEqual(await saved, response);
    assert.deepEqual(store.entries(), [response]);
    assert.equal(store.pending().size, 0);
    assert.equal(store.totalsPerDay()[range.from], 90);
    assert.equal(store.totalsPerWeek()[range.from], 90);
    assert.equal(store.newDraft(range.from).serviceId, 'development');
  } finally {
    injector.destroy();
  }
});

test('failed create rolls back only its own optimistic entry and preserves field errors', async () => {
  const { store, gateway, injector } = await setup();
  try {
    const first = store.save(draft);
    const second = store.save({ ...draft, date: '2026-11-10', duration: '2' });
    gateway.creates[1]!.resolve(
      entry('second', { date: '2026-11-10', minutes: 120 }),
    );
    await second;
    const errors = {
      date: 'Period is now locked.',
      duration: 'Too many hours.',
      description: 'Add details.',
    };
    gateway.creates[0]!.reject(new EntryValidationError(errors));
    await assert.rejects(first, (error) => {
      assert.deepEqual(saveErrors(error), errors);
      return true;
    });
    assert.deepEqual(
      store.entries().map((item) => item.id),
      ['second'],
    );
    assert.equal(store.totalMinutes(), 120);
    assert.equal(store.pending().size, 0);
  } finally {
    injector.destroy();
  }
});

test('failed update preserves unrelated successful writes and rejects overlapping edits to the same ID', async () => {
  const { store, gateway, injector } = await setup([
    entry('first'),
    entry('second', { date: '2026-11-10' }),
  ]);
  try {
    const first = store.save({ ...draft, duration: '2' }, 'first');
    assert.equal(store.entries()[0]!.minutes, 120);
    await assert.rejects(store.save(draft, 'first'), EntryValidationError);
    await assert.rejects(store.delete('first'), EntryValidationError);
    const second = store.save(
      { ...draft, date: '2026-11-10', description: 'Updated second' },
      'second',
    );
    gateway.updates[1]!.resolve(
      entry('second', { date: '2026-11-10', description: 'Updated second' }),
    );
    await second;
    gateway.updates[0]!.reject(new Error('Offline'));
    await assert.rejects(first);
    assert.equal(store.entries()[0]!.minutes, 90);
    assert.equal(store.entries()[1]!.description, 'Updated second');
    assert.ok(saveErrors(new Error()).form);
  } finally {
    injector.destroy();
  }
});

test('optimistic deletes restore failures and commit successes without losing other entries', async () => {
  const { store, gateway, injector } = await setup([
    entry('first'),
    entry('second'),
  ]);
  try {
    const first = store.delete('first');
    const second = store.delete('second');
    assert.equal(store.entries().length, 0);
    gateway.deletes[1]!.resolve();
    await second;
    gateway.deletes[0]!.reject(new Error('Offline'));
    await assert.rejects(first);
    assert.deepEqual(
      store.entries().map((item) => item.id),
      ['first'],
    );
  } finally {
    injector.destroy();
  }
});

test('latest range request wins even when older responses arrive last', async () => {
  const { store, gateway, injector } = await setup();
  try {
    gateway.deferLists = true;
    const older = store.load(range);
    const newer = store.load({ from: '2026-11-16', to: '2026-11-22' });
    gateway.lists[1]!.resolve([entry('newer', { date: '2026-11-16' })]);
    await newer;
    gateway.lists[0]!.resolve([entry('older')]);
    await older;
    assert.deepEqual(
      store.entries().map((item) => item.id),
      ['newer'],
    );
    assert.equal(store.loading(), false);
  } finally {
    injector.destroy();
  }
});

test('a stale load cannot erase an in-flight create and refreshes after it settles', async () => {
  const { store, gateway, injector } = await setup();
  try {
    gateway.deferLists = true;
    const loading = store.load(range);
    const saving = store.save(draft);
    gateway.lists[0]!.resolve([]);
    await loading;
    assert.equal(store.totalMinutes(), 90);
    gateway.rows = [entry('created')];
    gateway.deferLists = false;
    gateway.creates[0]!.resolve(entry('created'));
    await saving;
    await Promise.resolve();
    assert.deepEqual(
      store.entries().map((item) => item.id),
      ['created'],
    );
  } finally {
    injector.destroy();
  }
});

test('a load started before a committed update refetches instead of restoring stale data', async () => {
  const { store, gateway, injector } = await setup([entry('first')]);
  try {
    gateway.deferLists = true;
    const loading = store.load(range);
    const saving = store.save({ ...draft, duration: '2' }, 'first');
    gateway.rows = [entry('first', { minutes: 120 })];
    gateway.updates[0]!.resolve(gateway.rows[0]!);
    await saving;
    gateway.deferLists = false;
    gateway.lists[0]!.resolve([entry('first')]);
    await loading;
    assert.equal(store.totalMinutes(), 120);
  } finally {
    injector.destroy();
  }
});

test('filters affect computed totals, not daily validation; ranges cache other weeks', async () => {
  const { store, gateway, injector } = await setup([
    entry('first', {
      minutes: 390,
      projectId: 'research',
      serviceId: 'discovery',
    }),
    entry('second', { minutes: 60, billable: false }),
  ]);
  try {
    store.setFilters({ projectId: 'website', billable: 'non-billable' });
    assert.equal(store.totalMinutes(), 60);
    await assert.rejects(
      store.save({ ...draft, duration: '1' }),
      EntryValidationError,
    );
    await store.load({ from: '2026-11-16', to: '2026-11-22' });
    assert.equal(store.entries().length, 0);
    gateway.deferLists = true;
    const back = store.load(range);
    assert.equal(store.totalMinutes(), 60);
    gateway.lists[0]!.resolve(gateway.rows);
    await back;
  } finally {
    injector.destroy();
  }
});

test('an entry moved by the gateway cannot exist in two cached ranges', async () => {
  const { store, gateway, injector } = await setup([entry('moved')]);
  try {
    gateway.rows = [entry('moved', { date: '2026-11-16' })];
    await store.load({ from: '2026-11-16', to: '2026-11-22' });
    assert.equal(store.entries().length, 1);
    gateway.deferLists = true;
    const back = store.load(range);
    assert.equal(store.entries().length, 0);
    gateway.lists[0]!.resolve([]);
    await back;
  } finally {
    injector.destroy();
  }
});

test('load failures recover, invalid ranges are rejected, and locked records never reach the gateway', async () => {
  const { store, gateway, injector } = await setup([
    entry('approved', { approved: true }),
    entry('locked', { date: '2025-12-31' }),
  ]);
  try {
    await assert.rejects(store.delete('approved'), EntryValidationError);
    await assert.rejects(store.save(draft, 'approved'), EntryValidationError);
    await assert.rejects(store.save(draft, 'missing'), EntryValidationError);
    assert.equal(gateway.updates.length + gateway.deletes.length, 0);
    await store.load({ from: 'bad', to: '2026-11-15' });
    assert.match(store.error(), /valid date range/);
    gateway.failContext = true;
    await store.load(range);
    assert.match(store.error(), /Could not load/);
    assert.equal(store.loading(), false);
    gateway.failContext = false;
    await store.load(range);
    assert.equal(store.error(), '');
    await store.load({ from: '2025-12-29', to: '2026-01-04' });
    await assert.rejects(store.delete('locked'), EntryValidationError);
  } finally {
    injector.destroy();
  }
});

test('demo gateway copies data and retains create/update/delete changes only in memory', async () => {
  const gateway = new DemoTimesheetGateway();
  const context = await gateway.context();
  context.rules.maxMinutesPerDay = 1;
  assert.equal((await gateway.context()).rules.maxMinutesPerDay, 480);
  const created = await gateway.create(input);
  created.description = 'Changed outside gateway';
  assert.equal((await gateway.list(range))[0]!.description, input.description);
  await gateway.update(created.id, { ...input, minutes: 120 });
  assert.equal((await gateway.list(range))[0]!.minutes, 120);
  await gateway.delete(created.id);
  assert.deepEqual(await gateway.list(range), []);
});
