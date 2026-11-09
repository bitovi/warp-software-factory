import '@angular/compiler';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, test } from 'node:test';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import {
  Injector,
  provideZonelessChangeDetection,
  ɵresolveComponentResources as resolveComponentResources,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import { JSDOM } from 'jsdom';
import {
  DemoTimesheetGateway,
  EntryValidationError,
  TimesheetGateway,
  TimesheetStore,
  type EntryInput,
  type FieldErrors,
  type TimeEntry,
} from '@wsf/web/data-access-timesheet';
import { EntryDialog } from './entry-dialog';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Node: dom.window.Node,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
});
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
before(async () => {
  // tsx does not inline Angular resources, so JIT reads the production template and styles.
  await resolveComponentResources(async (url) =>
    readFileSync(new URL(url, import.meta.url), 'utf8'),
  );
});
afterEach(() => {
  TestBed.resetTestingModule();
  document.body.replaceChildren();
  dom.window.localStorage.clear();
});
after(() => {
  TestBed.resetTestEnvironment();
  dom.window.close();
});

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

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

async function setup(existing?: EntryInput) {
  const gateway = new RejectingGateway();
  const entry = existing ? await gateway.create(existing) : undefined;
  gateway.calls = 0;
  const closeResults: unknown[] = [];
  const storeInjector = Injector.create({
    providers: [
      TimesheetStore,
      { provide: TimesheetGateway, useValue: gateway },
    ],
  });
  const store = storeInjector.get(TimesheetStore);
  await store.load({ from: '2026-11-09', to: '2026-11-15' });
  TestBed.configureTestingModule({
    imports: [EntryDialog],
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { store, date: '2026-11-09', entry } },
      {
        provide: BrnDialogRef,
        useValue: {
          dialogId: 1,
          close: (result?: unknown) => closeResults.push(result),
          registerDescription: () => undefined,
          unregisterDescription: () => undefined,
        },
      },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(EntryDialog);
  fixture.detectChanges();
  await fixture.whenStable();
  const root: HTMLElement = fixture.nativeElement;
  const view = within(root);
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const change = async (label: RegExp, value: string) => {
    const control = view.getByLabelText<Control>(label);
    if (control.tagName === 'SELECT') {
      fireEvent.change(control, { target: { value } });
    } else {
      fireEvent.input(control, { target: { value } });
    }
    await settle();
  };
  const submit = async () => {
    fireEvent.click(view.getByRole('button', { name: 'Save entry' }));
    await settle();
  };
  const fill = async () => {
    await change(/^Project/, 'website');
    await change(/^Service/, 'development');
    await change(/^Duration/, '1:31');
    await change(/^Description/, 'Build search');
  };
  const describedBy = (label: RegExp) => {
    const control = view.getByLabelText<Control>(label);
    return (control.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .map(
        (id) => root.querySelector(`[id="${id}"]`)?.textContent?.trim() ?? '',
      )
      .join(' ');
  };
  return {
    root,
    view,
    store,
    gateway,
    closeResults,
    change,
    submit,
    fill,
    settle,
    describedBy,
    destroy: () => {
      fixture.destroy();
      storeInjector.destroy();
    },
  };
}

test('rendered pickers group eligible projects and clear service after a project change', async () => {
  const { view, change, destroy } = await setup();
  try {
    assert.deepEqual(
      view
        .getAllByRole('group')
        .filter((group) => group.tagName === 'OPTGROUP')
        .map((group) => group.getAttribute('label')),
      ['Acme', 'Northstar'],
    );
    const project = view.getByRole('combobox', { name: /^Project/ });
    assert.deepEqual(
      within(project)
        .getAllByRole<HTMLOptionElement>('option')
        .map((option) => option.textContent),
      [
        'Select a project',
        'Website refresh',
        'Customer portal',
        'Product research',
      ],
    );
    const service = view.getByRole<HTMLSelectElement>('combobox', {
      name: /^Service/,
    });
    assert.equal(service.disabled, true);
    await change(/^Project/, 'website');
    assert.equal(service.disabled, false);
    assert.deepEqual(
      within(service)
        .getAllByRole('option')
        .map((option) => option.textContent),
      ['Select a service', 'Development', 'Design'],
    );
    await change(/^Service/, 'design');
    await change(/^Project/, 'research');
    assert.equal(service.value, '');
    assert.deepEqual(
      within(service)
        .getAllByRole('option')
        .map((option) => option.textContent),
      ['Select a service', 'Discovery'],
    );
  } finally {
    destroy();
  }
});

test('rendered form rejects empty fields, previews rounding, and saves the entered values', async () => {
  const {
    view,
    gateway,
    store,
    closeResults,
    fill,
    submit,
    describedBy,
    destroy,
  } = await setup();
  try {
    await submit();
    assert.equal(gateway.calls, 0);
    assert.match(describedBy(/^Project/), /Choose an assigned, active project/);
    assert.match(describedBy(/^Duration/), /Use hours/);
    assert.match(describedBy(/^Description/), /Describe the work performed/);
    await fill();
    assert.match(view.getByRole('status').textContent ?? '', /1h 45m/);
    await submit();
    assert.equal(store.entries().length, 1);
    const [saved] = store.entries();
    assert.ok(saved);
    assert.equal(saved.minutes, 105);
    assert.equal(saved.description, 'Build search');
    assert.equal(saved.serviceId, 'development');
    assert.deepEqual(closeResults, [true]);
    assert.equal(store.newDraft('2026-11-10').projectId, 'website');
  } finally {
    destroy();
  }
});

test('rendered server errors describe the correct fields and preserve input through rollback and retry', async () => {
  const {
    view,
    gateway,
    store,
    closeResults,
    fill,
    change,
    submit,
    describedBy,
    destroy,
  } = await setup();
  try {
    await fill();
    fireEvent.click(view.getByRole('checkbox', { name: 'Billable time' }));
    const fields = {
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
    gateway.fields = fields;
    await submit();
    const expected = [
      [/^Project/, fields.projectId],
      [/^Service/, fields.serviceId],
      [/^Date/, fields.date],
      [/^Duration/, fields.duration],
      [/^Start/, fields.start],
      [/^End/, fields.end],
      [/^Description/, fields.description],
      [/^Billable/, fields.billable],
    ] as const;
    for (const [label, message] of expected) {
      assert.equal(
        view.getByLabelText(label).getAttribute('aria-invalid'),
        'true',
      );
      assert.ok(describedBy(label).includes(message));
      for (const [, otherMessage] of expected) {
        if (otherMessage !== message)
          assert.equal(describedBy(label).includes(otherMessage), false);
      }
    }
    assert.equal(view.getByText(fields.form).getAttribute('role'), 'alert');
    assert.equal(view.getByLabelText<Control>(/^Project/).value, 'website');
    assert.equal(view.getByLabelText<Control>(/^Service/).value, 'development');
    assert.equal(view.getByLabelText<Control>(/^Date/).value, '2026-11-09');
    assert.equal(view.getByLabelText<Control>(/^Duration/).value, '1:31');
    assert.equal(
      view.getByLabelText<Control>(/^Description/).value,
      'Build search',
    );
    assert.equal(
      view.getByRole<HTMLInputElement>('checkbox', { name: 'Billable time' })
        .checked,
      false,
    );
    assert.equal(store.entries().length, 0);
    assert.deepEqual(closeResults, []);
    await change(/^Description/, 'Add search indexing');
    assert.equal(
      view.getByLabelText(/^Description/).getAttribute('aria-invalid'),
      'false',
    );
    assert.match(describedBy(/^Date/), /Date locked by payroll/);
    gateway.fields = null;
    await submit();
    assert.equal(store.entries().length, 1);
    const [saved] = store.entries();
    assert.ok(saved);
    assert.equal(saved.description, 'Add search indexing');
    assert.equal(saved.billable, false);
    assert.deepEqual(closeResults, [true]);
  } finally {
    destroy();
  }
});

test('rendered pending form blocks duplicate submits and dismissal until saving completes', async () => {
  const { root, view, gateway, closeResults, fill, submit, settle, destroy } =
    await setup();
  try {
    let finish!: (entry: TimeEntry) => void;
    gateway.pending = new Promise((resolve) => {
      finish = resolve;
    });
    await fill();
    await submit();
    assert.equal(
      view.getByRole<HTMLButtonElement>('button', { name: 'Saving…' }).disabled,
      true,
    );
    assert.equal(
      view.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled,
      true,
    );
    assert.equal(
      view.getByRole<HTMLButtonElement>('button', { name: 'Close dialog' })
        .disabled,
      true,
    );
    const form = root.querySelector('form');
    assert.ok(form);
    fireEvent.submit(form);
    fireEvent.keyDown(root, { key: 'Escape' });
    await settle();
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
    await waitFor(() =>
      assert.equal(
        view.getByRole<HTMLButtonElement>('button', { name: 'Save entry' })
          .disabled,
        false,
      ),
    );
    await settle();
    assert.deepEqual(closeResults, [true]);
  } finally {
    destroy();
  }
});

test('rendered edit form preserves the original interval and updates the existing saved entry', async () => {
  const { view, store, change, submit, describedBy, destroy } = await setup({
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
    const [original] = store.entries();
    assert.ok(original);
    assert.equal(view.getByLabelText<Control>(/^Duration/).value, '91m');
    assert.equal(view.getByLabelText<Control>(/^Start/).value, '09:00');
    assert.equal(view.getByLabelText<Control>(/^End/).value, '10:31');
    assert.match(view.getByRole('status').textContent ?? '', /1h 45m/);
    await change(/^Description/, 'Search indexing and tests');
    await submit();
    assert.equal(describedBy(/^Duration/).includes('must match'), false);
    assert.equal(store.entries().length, 1);
    const [saved] = store.entries();
    assert.ok(saved);
    assert.equal(saved.id, original.id);
    assert.equal(saved.description, 'Search indexing and tests');
    assert.equal(saved.minutes, 105);
    assert.equal(saved.rateSnapshot.hourlyRate, 80);
  } finally {
    destroy();
  }
});

test('rendered cancel, close button, and Escape dismiss without saving entered changes', async () => {
  const { root, view, gateway, store, closeResults, fill, settle, destroy } =
    await setup();
  try {
    await fill();
    fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
    await settle();
    assert.deepEqual(closeResults, [undefined]);
    fireEvent.click(view.getByRole('button', { name: 'Close dialog' }));
    await settle();
    assert.deepEqual(closeResults, [undefined, undefined]);
    fireEvent.keyDown(root, { key: 'Escape' });
    await settle();
    assert.deepEqual(closeResults, [undefined, undefined, undefined]);
    assert.equal(gateway.calls, 0);
    assert.equal(store.entries().length, 0);
  } finally {
    destroy();
  }
});
