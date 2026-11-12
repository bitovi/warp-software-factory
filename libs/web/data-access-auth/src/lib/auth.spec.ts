import '@angular/compiler';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  HttpBackend,
  HttpClient,
  HttpHandler,
  type HttpHandlerFn,
  type HttpRequest,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Injector, runInInjectionContext } from '@angular/core';
import {
  API_BASE_URL,
  ApiRequestError,
  apiBaseUrlInterceptor,
  apiErrorInterceptor,
} from '@wsf/web/core';
import { firstValueFrom } from 'rxjs';
import { AuthClient } from './auth-client';
import { AccountCreatedError, AuthStore } from './auth-store';
import { authInterceptor } from './auth-interceptor';

const credentials = {
  email: 'owner@example.test',
  password: 'long test password',
};
const company = {
  id: '738dbdca-09d8-47d9-af39-3fb3663fd71c',
  name: 'Studio',
  slug: 'studio',
};
const user = {
  id: '438dbdca-09d8-47d9-af39-3fb3663fd71c',
  email: credentials.email,
  firstName: 'A',
  lastName: 'User',
  emailVerifiedAt: null,
  status: 'active',
};
const membership = {
  id: '538dbdca-09d8-47d9-af39-3fb3663fd71c',
  userId: user.id,
  companyId: company.id,
  isOwner: true,
  status: 'active',
};
const me = { user, company, memberships: [{ ...membership, company }] };
const token = (value: string) => ({
  accessToken: value,
  tokenType: 'Bearer',
  expiresIn: 900,
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(t: TestContext) {
  const injector = Injector.create({
    providers: [
      ...provideHttpClientTesting(),
      HttpClient,
      AuthClient,
      AuthStore,
      { provide: API_BASE_URL, useValue: '/api' },
      {
        provide: HttpHandler,
        useFactory: (backend: HttpBackend) => ({
          handle: (request: HttpRequest<unknown>) => {
            const handler: HttpHandlerFn = (req) => backend.handle(req);
            return runInInjectionContext(injector, () =>
              apiErrorInterceptor(request, (req) =>
                authInterceptor(req, (authorized) =>
                  runInInjectionContext(injector, () =>
                    apiBaseUrlInterceptor(authorized, handler),
                  ),
                ),
              ),
            );
          },
        }),
        deps: [HttpBackend],
      },
    ],
  });
  const http = injector.get(HttpTestingController);
  t.after(() => {
    http.verify();
    injector.destroy();
  });
  return {
    store: injector.get(AuthStore),
    client: injector.get(HttpClient),
    http,
  };
}

async function login(context: ReturnType<typeof setup>) {
  const result = context.store.login(credentials);
  await tick();
  const request = context.http.expectOne('/api/auth/login');
  assert.equal(request.request.withCredentials, true);
  assert.equal(
    request.request.headers.get('X-Requested-With'),
    'XMLHttpRequest',
  );
  assert.equal(request.request.headers.has('Authorization'), false);
  request.flush(token('old-access'));
  await tick();
  const identity = context.http.expectOne('/api/auth/me');
  assert.equal(
    identity.request.headers.get('Authorization'),
    'Bearer old-access',
  );
  identity.flush(me);
  await result;
}

test('signup validates the shared contracts, logs in, and loads the active workspace', async (t) => {
  const context = setup(t);
  const { store, http } = context;
  const result = store.signup({
    ...credentials,
    email: ' OWNER@example.test ',
    firstName: ' A ',
    lastName: 'User',
    companyName: ' Studio ',
  });
  await tick();
  const signup = http.expectOne('/api/auth/signup');
  assert.deepEqual(signup.request.body, {
    ...credentials,
    firstName: 'A',
    lastName: 'User',
    companyName: 'Studio',
  });
  signup.flush({ user, company, membership });
  await tick();
  http.expectOne('/api/auth/login').flush(token('signup-access'));
  await tick();
  http.expectOne('/api/auth/me').flush(me);
  await result;
  assert.equal(store.status(), 'authenticated');
  assert.deepEqual(store.user(), user);
  assert.deepEqual(store.activeCompany(), company);
  assert.deepEqual(store.memberships(), me.memberships);
});

test('startup restoration is single flight and waits for validated identity', async (t) => {
  const { store, http } = setup(t);
  const restored = store.initialize();
  assert.equal(store.initialize(), restored);
  await tick();
  http.expectOne('/api/auth/refresh').flush(token('restored'));
  await tick();
  assert.equal(store.status(), 'initializing');
  http.expectOne('/api/auth/me').flush(me);
  await restored;
  assert.equal(store.status(), 'authenticated');
});

test('concurrent and delayed 401s share one rotation, then retry with the new token', async (t) => {
  const context = setup(t);
  await login(context);
  const { client, http, store } = context;
  const requests = [1, 2, 3].map((id) =>
    firstValueFrom(client.get(`/api/tasks?id=${id}`)),
  );
  const initial = http.match((request) => request.url.startsWith('/api/tasks'));
  initial[0]?.flush({}, { status: 401, statusText: 'Unauthorized' });
  initial[1]?.flush({}, { status: 401, statusText: 'Unauthorized' });
  await tick();
  const refresh = http.expectOne('/api/auth/refresh');
  assert.equal(refresh.request.headers.has('Authorization'), false);
  assert.equal(refresh.request.withCredentials, true);
  refresh.flush(token('new-access'));
  await tick();
  initial[2]?.flush({}, { status: 401, statusText: 'Unauthorized' });
  await tick();
  const retries = http.match((request) => request.url.startsWith('/api/tasks'));
  assert.equal(retries.length, 3);
  retries.forEach((request) => {
    assert.equal(
      request.request.headers.get('Authorization'),
      'Bearer new-access',
    );
    request.flush([]);
  });
  await Promise.all(requests);
  assert.equal(store.status(), 'authenticated');
});

test('a repeated 401 stops after one retry and clears the session', async (t) => {
  const context = setup(t);
  await login(context);
  const { store, client, http } = context;
  const result = firstValueFrom(client.get('/api/tasks'));
  const rejected = assert.rejects(
    result,
    (error: unknown) =>
      error instanceof ApiRequestError && error.response.status === 401,
  );
  http
    .expectOne('/api/tasks')
    .flush({}, { status: 401, statusText: 'Unauthorized' });
  await tick();
  http.expectOne('/api/auth/refresh').flush(token('retry-access'));
  await tick();
  http
    .expectOne('/api/tasks')
    .flush({}, { status: 401, statusText: 'Unauthorized' });
  await rejected;
  await tick();
  http.expectNone('/api/auth/refresh');
  http.expectOne('/api/auth/logout').flush(null);
  await tick();
  assert.equal(store.status(), 'anonymous');
  assert.equal(store.accessToken(), null);
  assert.equal(store.user(), null);
});

test('failed refresh rejects all waiting requests and signs out once without recursion', async (t) => {
  const context = setup(t);
  await login(context);
  const { store, client, http } = context;
  const requests = [1, 2].map((id) =>
    assert.rejects(firstValueFrom(client.get(`/api/tasks?id=${id}`))),
  );
  http
    .match((request) => request.url.startsWith('/api/tasks'))
    .forEach((request) =>
      request.flush({}, { status: 401, statusText: 'Unauthorized' }),
    );
  await tick();
  http
    .expectOne('/api/auth/refresh')
    .flush({}, { status: 401, statusText: 'Unauthorized' });
  await tick();
  http.expectOne('/api/auth/logout').flush(null);
  await Promise.all(requests);
  await tick();
  assert.equal(store.status(), 'anonymous');
  assert.deepEqual(store.memberships(), []);
});

test('logout waits for refresh cookie response and prevents stale retries or restored identity', async (t) => {
  const context = setup(t);
  await login(context);
  const { store, client, http } = context;
  const request = assert.rejects(firstValueFrom(client.get('/api/tasks')));
  http
    .expectOne('/api/tasks')
    .flush({}, { status: 401, statusText: 'Unauthorized' });
  await tick();
  const refresh = http.expectOne('/api/auth/refresh');
  const logout = store.logout();
  assert.equal(store.accessToken(), null);
  http.expectNone('/api/auth/logout');
  refresh.flush(token('stale-access'));
  await request;
  await tick();
  http.expectNone('/api/tasks');
  http.expectOne('/api/auth/logout').flush(null);
  await logout;
  assert.equal(store.status(), 'anonymous');
  assert.equal(store.user(), null);
});

test('logout invalidates pending login and me, and a new login runs after cookie cleanup', async (t) => {
  const context = setup(t);
  const { store, http } = context;
  const first = assert.rejects(store.login(credentials));
  await tick();
  const pendingLogin = http.expectOne('/api/auth/login');
  const logout = store.logout();
  const second = store.login(credentials);
  pendingLogin.flush(token('stale-login'));
  await first;
  await tick();
  http.expectOne('/api/auth/logout').flush(null);
  await logout;
  await tick();
  http.expectOne('/api/auth/login').flush(token('current-login'));
  await tick();
  const identity = http.expectOne('/api/auth/me');
  const third = store.logout();
  identity.flush(me);
  await assert.rejects(second);
  await tick();
  http.expectOne('/api/auth/logout').flush(null);
  await third;
  assert.equal(store.status(), 'anonymous');
});

test('a response from an old session cannot refresh or retry into a new session', async (t) => {
  const context = setup(t);
  await login(context);
  const { store, client, http } = context;
  const old = assert.rejects(firstValueFrom(client.get('/api/tasks')));
  const pending = http.expectOne('/api/tasks');
  const logout = store.logout();
  await tick();
  http.expectOne('/api/auth/logout').flush(null);
  await logout;
  await login(context);
  pending.flush({}, { status: 401, statusText: 'Unauthorized' });
  await old;
  http.expectNone('/api/auth/refresh');
  assert.equal(store.status(), 'authenticated');
});

test('never sends the access token to third-party, asset, lookalike or cookie endpoints', async (t) => {
  const context = setup(t);
  await login(context);
  const { client, http } = context;
  for (const url of [
    'https://other.test/api/tasks',
    '//other.test/api/tasks',
    '/assets/data',
    '/apiary',
    '/api/auth/login?source=ui',
  ]) {
    const result = assert.rejects(firstValueFrom(client.get(url)));
    const request = http.expectOne(url);
    assert.equal(request.request.headers.has('Authorization'), false);
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    await result;
    http.expectNone('/api/auth/refresh');
  }
});

test('rejects invalid identity and token payloads and reports partial signup failure', async (t) => {
  const { store, http } = setup(t);
  const signup = assert.rejects(
    store.signup({
      ...credentials,
      firstName: 'A',
      lastName: 'User',
      companyName: 'Studio',
    }),
    AccountCreatedError,
  );
  await tick();
  http.expectOne('/api/auth/signup').flush({ user, company, membership });
  await tick();
  http
    .expectOne('/api/auth/login')
    .flush({ ...token('invalid'), expiresIn: 10 });
  await tick();
  http.expectOne('/api/auth/logout').flush(null);
  await signup;
  await tick();
  const pending = assert.rejects(store.login(credentials));
  await tick();
  http.expectOne('/api/auth/login').flush(token('valid'));
  await tick();
  http
    .expectOne('/api/auth/me')
    .flush({ user: { ...user, id: 'invalid' }, company, memberships: [] });
  await tick();
  http.expectOne('/api/auth/logout').flush(null);
  await pending;
  await tick();
  assert.equal(store.accessToken(), null);
  assert.equal(store.user(), null);
});
