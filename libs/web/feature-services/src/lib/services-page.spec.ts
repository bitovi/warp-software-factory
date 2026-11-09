import '@angular/compiler';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { Window } from 'happy-dom';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  SERVICES_CATALOG,
  SessionServicesCatalog,
  type ServiceAccess,
} from '@wsf/web/data-access-services';
import { ServicesPage } from './services-page';

const window = new Window();
Object.assign(globalThis, {
  window,
  document: window.document,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  Event: window.Event,
});
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

afterEach(() => TestBed.resetTestingModule());

async function render(access: ServiceAccess) {
  const catalog = new SessionServicesCatalog(access, [
    {
      id: 'design',
      name: 'Design',
      color: '#7c3aed',
      billable: true,
      status: 'active',
      usageCount: 0,
      defaultRateMinor: 12345,
    },
    {
      id: 'used',
      name: 'Consulting',
      color: '#2563eb',
      billable: true,
      status: 'active',
      usageCount: 3,
      defaultRateMinor: 15000,
    },
  ]);
  TestBed.overrideComponent(ServicesPage, {
    set: {
      template: readFileSync(
        'libs/web/feature-services/src/lib/services-page.html',
        'utf8',
      ),
      templateUrl: undefined,
      styles: [],
      styleUrl: undefined,
    },
  });
  await TestBed.compileComponents();
  TestBed.configureTestingModule({
    imports: [ServicesPage],
    providers: [
      provideZonelessChangeDetection(),
      { provide: SERVICES_CATALOG, useValue: catalog },
    ],
  });
  const fixture = TestBed.createComponent(ServicesPage);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const query = <T extends Element>(selector: string): T => {
    const found = element.querySelector<T>(selector);
    assert.ok(found, `Missing ${selector}`);
    return found;
  };
  const click = async (selector: string) => {
    query<HTMLButtonElement>(selector).click();
    await fixture.whenStable();
  };
  const input = async (selector: string, value: string) => {
    const field = query<HTMLInputElement>(selector);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  };
  return { fixture, element, query, click, input, catalog };
}

const admin: ServiceAccess = {
  companyAdmin: true,
  permissions: ['rates:view'],
  currency: 'USD',
};

test('renders lifecycle changes and protects used-service deletion', async () => {
  const { fixture, element, query, click, input, catalog } =
    await render(admin);
  assert.match(element.textContent ?? '', /Default rate/);
  assert.equal(
    query<HTMLButtonElement>('[aria-label="Delete Consulting"]').disabled,
    true,
  );
  await click('button[hlmBtn]');
  assert.equal(
    query<HTMLDialogElement>('#service-name').closest('dialog')?.open,
    true,
  );
  await input('#service-name', 'Research');
  await input('#service-rate', '75.25');
  await click('[aria-label="Use color #059669"]');
  await click('#service-billable');
  query<HTMLFormElement>('form').dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await fixture.whenStable();
  const service = catalog.services().find((item) => item.name === 'Research');
  assert.ok(service);
  assert.equal(service.defaultRateMinor, 7525);
  assert.equal(service.color, '#059669');
  assert.equal(service.billable, false);
  await click('[aria-label="Edit Research"]');
  await input('#service-name', 'Research updated');
  query<HTMLFormElement>('form').dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await fixture.whenStable();
  await click('[aria-label="Archive Research updated"]');
  assert.equal(
    catalog.activeOptions().some((item) => item.id === service.id),
    false,
  );
  assert.ok(element.querySelector('[aria-label="Restore Research updated"]'));
  await click('[aria-label="Restore Research updated"]');
  assert.equal(
    catalog.activeOptions().some((item) => item.id === service.id),
    true,
  );
  await click('[aria-label="Delete Research updated"]');
  await click('dialog[open] .secondary-button');
  assert.equal(
    query<HTMLDialogElement>('dialog[aria-labelledby="delete-title"]').open,
    false,
  );
  assert.ok(catalog.services().some((item) => item.id === service.id));
  await click('[aria-label="Delete Research updated"]');
  await click('.delete-button');
  assert.equal(
    catalog.services().some((item) => item.id === service.id),
    false,
  );
  assert.match(
    element.querySelector('[role="status"]')?.textContent ?? '',
    /deleted/,
  );
});

test('defaults to denied management and rate access without a preview provider', async () => {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const catalog = TestBed.inject(SERVICES_CATALOG);
  assert.equal(catalog.canManage, false);
  assert.equal(catalog.canViewRates, false);
  await assert.rejects(
    catalog.create({ name: 'Design', color: '#2563eb', billable: true }),
    /Only company admins/,
  );
});

test('does not render rates or a rate editor without rates:view', async () => {
  const { element, click, input, query, fixture, catalog } = await render({
    ...admin,
    permissions: [],
  });
  assert.doesNotMatch(
    element.textContent ?? '',
    /Default rate|123\.45|150\.00/,
  );
  assert.equal(element.querySelector('#service-rate'), null);
  assert.equal(JSON.stringify(catalog.services()).includes('12345'), false);
  await click('[aria-label="Edit Design"]');
  assert.equal(element.querySelector('#service-rate'), null);
  await input('#service-name', 'Design updated');
  query<HTMLFormElement>('form').dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await fixture.whenStable();
  assert.ok(element.querySelector('[aria-label="Edit Design updated"]'));
});

test('renders read-only access without management controls', async () => {
  const { element } = await render({
    ...admin,
    companyAdmin: false,
    permissions: [],
  });
  assert.match(element.textContent ?? '', /access is read-only/);
  assert.equal(element.querySelector('main button'), null);
  assert.doesNotMatch(
    element.querySelector('thead')?.textContent ?? '',
    /Actions|Default rate/,
  );
});

test('shows a validation error without closing the editor or changing records', async () => {
  const { fixture, query, click, input, catalog } = await render(admin);
  await click('button[hlmBtn]');
  await input('#service-name', 'Design');
  query<HTMLFormElement>('form').dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await fixture.whenStable();
  assert.match(query('[role="alert"]').textContent ?? '', /already exists/);
  assert.equal(query<HTMLDialogElement>('dialog').open, true);
  assert.equal(catalog.services().length, 2);
});
