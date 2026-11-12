import '@angular/compiler';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, test } from 'node:test';
import { provideLocationMocks } from '@angular/common/testing';
import {
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { AuthStore } from '@wsf/web/data-access-auth';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { provideRouter, Router } from '@angular/router';
import { JSDOM } from 'jsdom';
import { AppShell } from './app-shell';

@Component({ template: '<h1>Feature content</h1>' })
class FeaturePage {}

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

before(() => {
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    Node: { configurable: true, value: dom.window.Node },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  });
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => TestBed.resetTestingModule());
after(() => {
  TestBed.resetTestEnvironment();
  dom.window.close();
});

async function renderShell() {
  TestBed.overrideComponent(AppShell, {
    set: {
      template: readFileSync(
        new URL('./app-shell.html', import.meta.url),
        'utf8',
      ),
      templateUrl: undefined,
      styles: [],
      styleUrl: undefined,
    },
  });
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthStore,
        useValue: {
          status: signal('authenticated'),
          activeCompany: signal(null),
        },
      },
      provideZonelessChangeDetection(),
      provideLocationMocks(),
      provideRouter([
        { path: '', component: FeaturePage },
        { path: 'projects', component: FeaturePage },
      ]),
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(AppShell);
  fixture.detectChanges();
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/');
  await fixture.whenStable();
  const root: HTMLElement = fixture.nativeElement;
  const toggle = root.querySelector<HTMLButtonElement>('.menu-toggle');
  const main = root.querySelector<HTMLElement>('main');
  assert.ok(toggle);
  assert.ok(main);
  return { fixture, root, toggle, main, router };
}

test('places expanded navigation after the menu toggle in tab order and focuses content on route activation', async () => {
  const { fixture, root, toggle, main, router } = await renderShell();
  toggle.focus();
  toggle.click();
  await fixture.whenStable();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, toggle);
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.sidebar a')];
  assert.ok(links.length > 0);
  assert.ok(
    links.every(
      (link) =>
        toggle.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  );
  assert.ok(links.every((link) => link.tabIndex === 0));
  const projects = root.querySelector<HTMLAnchorElement>(
    'nav a[href="/projects"]',
  );
  assert.ok(projects);
  projects.focus();
  projects.click();
  await fixture.whenStable();
  assert.equal(router.url, '/projects');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, main);
});

for (const [name, selector] of [
  ['current navigation link', 'nav a[href="/"]'],
  ['current brand link', '.brand'],
] as const) {
  test(`focuses content when the ${name} closes the expanded menu without route activation`, async () => {
    const { fixture, root, toggle, main, router } = await renderShell();
    toggle.click();
    await fixture.whenStable();
    const current = root.querySelector<HTMLAnchorElement>(selector);
    assert.ok(current);
    current.focus();
    current.click();
    await fixture.whenStable();
    assert.equal(router.url, '/');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, main);
  });
}
