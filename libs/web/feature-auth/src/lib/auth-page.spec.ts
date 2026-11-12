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
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { type Login, type Signup } from '@wsf/shared/schemas';
import { ApiRequestError } from '@wsf/web/core';
import { AccountCreatedError, AuthStore } from '@wsf/web/data-access-auth';
import { JSDOM } from 'jsdom';
import { authGuard, guestGuard, safeReturnUrl } from './auth-guards';
import { AuthPage } from './auth-page';

@Component({ template: '<h1>Route</h1>' })
class RoutePage {}

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://localhost/',
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

test('accepts internal return locations and rejects external, encoded and auth-loop destinations', () => {
  assert.equal(
    safeReturnUrl('/projects?view=active%20work#list'),
    '/projects?view=active%20work#list',
  );
  for (const value of [
    null,
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/%2fevil.test',
    '/%5cevil.test',
    '/login?returnUrl=/login',
    '/signup',
    '/a/../login',
    '/login;mode=other',
    '/\nevil.test',
  ]) {
    assert.equal(safeReturnUrl(value), '/', String(value));
  }
});

test('guards wait for initialization, preserve protected URLs, and skip auth pages after restoration', async () => {
  let finish!: () => void;
  const initialized = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const status = signal('initializing');
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideLocationMocks(),
      {
        provide: AuthStore,
        useValue: { status, initialize: () => initialized },
      },
      provideRouter([
        { path: 'login', component: RoutePage, canActivate: [guestGuard] },
        { path: 'signup', component: RoutePage, canActivate: [guestGuard] },
        { path: 'projects', component: RoutePage, canActivate: [authGuard] },
        { path: '', component: RoutePage },
      ]),
    ],
  });
  const router = TestBed.inject(Router);
  let complete = false;
  const pending = router
    .navigateByUrl('/projects?view=active#list')
    .then(() => {
      complete = true;
    });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(complete, false);
  status.set('anonymous');
  finish();
  await pending;
  assert.equal(
    router.url,
    '/login?returnUrl=%2Fprojects%3Fview%3Dactive%23list',
  );
  status.set('authenticated');
  await router.navigateByUrl(
    '/signup?returnUrl=%2Fprojects%3Fview%3Dactive%23list',
  );
  assert.equal(router.url, '/projects?view=active#list');
  await router.navigateByUrl('/signup?returnUrl=https://evil.test');
  assert.equal(router.url, '/');
  await router.navigateByUrl('/projects');
  assert.equal(router.url, '/projects');
});

async function render(signup: boolean, failure?: unknown) {
  const calls: (Login | Signup)[] = [];
  const status = signal('anonymous');
  const authenticate = async (input: Login | Signup) => {
    calls.push(input);
    if (failure) throw failure;
    status.set('authenticated');
  };
  TestBed.overrideComponent(AuthPage, {
    set: {
      template: readFileSync(
        new URL('./auth-page.html', import.meta.url),
        'utf8',
      ),
      templateUrl: undefined,
      styles: [],
      styleUrl: undefined,
    },
  });
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideLocationMocks(),
      provideRouter([
        { path: 'projects', component: RoutePage },
        { path: '', component: RoutePage },
      ]),
      {
        provide: AuthStore,
        useValue: { status, login: authenticate, signup: authenticate },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            data: { signup },
            queryParamMap: convertToParamMap({ returnUrl: '/projects' }),
          },
        },
      },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(AuthPage);
  fixture.detectChanges();
  await fixture.whenStable();
  const root: HTMLElement = fixture.nativeElement;
  const fill = async (name: string, value: string) => {
    const input = root.querySelector<HTMLInputElement>(`#${name}`);
    assert.ok(input);
    input.value = value;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await fixture.whenStable();
  };
  const submit = async () => {
    root
      .querySelector('form')
      ?.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
    await fixture.whenStable();
  };
  return { fixture, root, fill, submit, calls, status };
}

test('signup renders linked validation errors, normalizes shared fields, and returns to the protected page', async () => {
  const { root, fill, submit, calls } = await render(true);
  await submit();
  assert.equal(calls.length, 0);
  assert.equal(
    root.querySelector('#password')?.getAttribute('aria-invalid'),
    'true',
  );
  assert.equal(
    root.querySelector('#password')?.getAttribute('aria-describedby'),
    'password-errors',
  );
  assert.match(
    root.querySelector('#password-errors')?.textContent ?? '',
    /at least 12/,
  );
  await fill('firstName', ' Ada ');
  await fill('lastName', ' Lovelace ');
  await fill('companyName', ' Analytical ');
  await fill('email', ' ADA@Example.test ');
  await fill('password', '  long password  ');
  await submit();
  assert.deepEqual(calls, [
    {
      firstName: 'Ada',
      lastName: 'Lovelace',
      companyName: 'Analytical',
      email: 'ada@example.test',
      password: '  long password  ',
    },
  ]);
  assert.equal(TestBed.inject(Router).url, '/projects');
  assert.equal(root.querySelector<HTMLInputElement>('#password')?.value, '');
});

test('login uses the login password contract, displays safe errors, and blocks duplicate submissions while busy', async () => {
  const { root, fill, submit, calls, status, fixture } = await render(
    false,
    new ApiRequestError(
      new HttpErrorResponse({
        status: 401,
        error: { message: 'private details' },
      }),
    ),
  );
  await fill('email', ' ADA@example.test ');
  await fill('password', 'old');
  status.set('authenticating');
  await fixture.whenStable();
  await submit();
  assert.equal(calls.length, 0);
  status.set('anonymous');
  await fixture.whenStable();
  await submit();
  assert.deepEqual(calls, [{ email: 'ada@example.test', password: 'old' }]);
  assert.equal(
    root.querySelector('[role=alert]')?.textContent?.trim(),
    'Email or password is incorrect.',
  );
  assert.equal(root.querySelector<HTMLInputElement>('#password')?.value, '');
  assert.equal(TestBed.inject(Router).url, '/');
});

test('retains server field errors without exposing an arbitrary error body', async () => {
  const { root, fill, submit } = await render(
    false,
    new ApiRequestError(
      new HttpErrorResponse({
        status: 400,
        error: {
          statusCode: 400,
          message: 'Validation failed',
          fieldErrors: { email: ['Check this email.'] },
          formErrors: [],
        },
      }),
    ),
  );
  await fill('email', 'a@example.test');
  await fill('password', 'password');
  await submit();
  assert.equal(
    root.querySelector('#email-errors')?.textContent?.trim(),
    'Check this email.',
  );
});

test('directs an already-created account to sign in after the session step fails', async () => {
  const { root, fill, submit } = await render(
    true,
    new AccountCreatedError(new Error('private details')),
  );
  for (const [name, value] of Object.entries({
    firstName: 'A',
    lastName: 'B',
    companyName: 'Studio',
    email: 'a@example.test',
    password: 'long test password',
  }))
    await fill(name, value);
  await submit();
  assert.match(
    root.querySelector('[role=alert]')?.textContent ?? '',
    /account was created.*Sign in to continue/,
  );
});
