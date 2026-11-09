import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Injector, runInInjectionContext } from '@angular/core';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import {
  DemoTimesheetGateway,
  EntryValidationError,
  TimesheetGateway,
  TimesheetStore,
  type EntryDraft,
  type EntryField,
  type EntryInput,
  type FieldErrors,
  type TimeEntry,
} from '@wsf/web/data-access-timesheet';
import { EntryDialog } from './entry-dialog';

class DialogHarness extends EntryDialog {
  get values() {
    return this.draft();
  }
  get projectGroups() {
    return this.groups();
  }
  get serviceOptions() {
    return this.services();
  }
  get rounded() {
    return this.preview();
  }
  fieldError(field: EntryField) {
    return this.error(field);
  }
  set<K extends keyof EntryDraft>(field: K, value: EntryDraft[K]) {
    this.change(field, value);
  }
  submit() {
    return this.save();
  }
  dismiss() {
    this.close();
  }
}

class RejectingGateway extends DemoTimesheetGateway {
  calls = 0;
  fields: FieldErrors | null = null;
  pending: Promise<TimeEntry> | null = null;
  override async create(input: EntryInput): Promise<TimeEntry> {
    this.calls++;
    if (this.fields) throw new EntryValidationError(this.fields);
    return this.pending ?? super.create(input);
  }
}

async function setup(entry?: TimeEntry) {
  const gateway = new RejectingGateway();
  const closeResults: unknown[] = [];
  const storeInjector = Injector.create({
    providers: [
      TimesheetStore,
      { provide: TimesheetGateway, useValue: gateway },
    ],
  });
  const store = storeInjector.get(TimesheetStore);
  await store.load({ from: '2026-11-09', to: '2026-11-15' });
  const dialogInjector = Injector.create({
    providers: [
      { provide: DIALOG_DATA, useValue: { store, date: '2026-11-09', entry } },
      {
        provide: BrnDialogRef,
        useValue: { close: (result?: unknown) => closeResults.push(result) },
      },
    ],
  });
  const dialog = runInInjectionContext(
    dialogInjector,
    () => new DialogHarness(),
  );
  return {
    dialog,
    gateway,
    store,
    closeResults,
    destroy: () => {
      dialogInjector.destroy();
      storeInjector.destroy();
    },
  };
}

function fill(dialog: DialogHarness) {
  dialog.set('projectId', 'website');
  dialog.set('serviceId', 'development');
  dialog.set('duration', '1:31');
  dialog.set('description', 'Build search');
}

test('dialog groups eligible projects by client and clears service on project change', async () => {
  const { dialog, destroy } = await setup();
  try {
    assert.deepEqual(
      dialog.projectGroups.map((group) => group.client),
      ['Acme', 'Northstar'],
    );
    assert.deepEqual(
      dialog.projectGroups.flatMap((group) =>
        group.projects.map((item) => item.id),
      ),
      ['website', 'portal', 'research'],
    );
    dialog.set('projectId', 'website');
    assert.deepEqual(
      dialog.serviceOptions.map((item) => item.id),
      ['development', 'design'],
    );
    dialog.set('serviceId', 'design');
    dialog.set('projectId', 'research');
    assert.equal(dialog.values.serviceId, '');
    assert.deepEqual(
      dialog.serviceOptions.map((item) => item.id),
      ['discovery'],
    );
  } finally {
    destroy();
  }
});

test('dialog rejects invalid fields, previews rounding, saves, and remembers the selection', async () => {
  const { dialog, gateway, store, closeResults, destroy } = await setup();
  try {
    await dialog.submit();
    assert.ok(dialog.fieldError('projectId'));
    assert.ok(dialog.fieldError('duration'));
    assert.equal(gateway.calls, 0);
    fill(dialog);
    assert.equal(dialog.rounded, '1h 45m');
    await dialog.submit();
    assert.equal(store.entries()[0]!.minutes, 105);
    assert.deepEqual(closeResults, [true]);
    assert.equal(store.newDraft('2026-11-10').projectId, 'website');
  } finally {
    destroy();
  }
});

test('server errors remain on their own fields, preserve the draft, and roll back the optimistic entry', async () => {
  const { dialog, gateway, store, closeResults, destroy } = await setup();
  try {
    fill(dialog);
    gateway.fields = {
      projectId: 'Assignment ended.',
      serviceId: 'Service is no longer available.',
      date: 'Date locked by payroll.',
      duration: 'Daily total rejected.',
      start: 'Start rejected.',
      end: 'End rejected.',
      description: 'More detail required.',
      billable: 'Project is not billable.',
      form: 'The server rejected this entry.',
    };
    await dialog.submit();
    for (const [field, message] of Object.entries(gateway.fields)) {
      assert.equal(dialog.fieldError(field as EntryField), message);
    }
    assert.equal(dialog.values.description, 'Build search');
    assert.equal(store.entries().length, 0);
    assert.deepEqual(closeResults, []);
    dialog.set('description', 'Add search indexing');
    assert.equal(dialog.fieldError('description'), undefined);
    assert.equal(dialog.fieldError('date'), 'Date locked by payroll.');
    gateway.fields = null;
    await dialog.submit();
    assert.equal(store.entries().length, 1);
  } finally {
    destroy();
  }
});

test('pending save prevents duplicate submits and dismissal until it completes', async () => {
  const { dialog, gateway, closeResults, destroy } = await setup();
  try {
    let finish!: (entry: TimeEntry) => void;
    gateway.pending = new Promise((resolve) => {
      finish = resolve;
    });
    fill(dialog);
    const saving = dialog.submit();
    await dialog.submit();
    dialog.dismiss();
    assert.equal(gateway.calls, 1);
    assert.deepEqual(closeResults, []);
    finish({
      projectId: 'website',
      serviceId: 'development',
      date: '2026-11-09',
      minutes: 105,
      start: null,
      end: null,
      description: 'Build search',
      billable: true,
      rateSnapshot: { hourlyRate: 125, currency: 'USD' },
      id: 'saved',
      approved: false,
    });
    await saving;
    assert.deepEqual(closeResults, [true]);
  } finally {
    destroy();
  }
});

test('editing a rounded entry restores its original interval for validation', async () => {
  const { dialog, destroy } = await setup({
    id: 'saved',
    approved: false,
    projectId: 'website',
    serviceId: 'development',
    date: '2026-11-09',
    minutes: 105,
    start: '09:00',
    end: '10:31',
    description: 'Build search',
    billable: true,
    rateSnapshot: { hourlyRate: 80, currency: 'USD' },
  });
  try {
    assert.equal(dialog.values.duration, '91m');
    assert.equal(dialog.rounded, '1h 45m');
    assert.equal(dialog.fieldError('duration'), undefined);
    dialog.dismiss();
  } finally {
    destroy();
  }
});
