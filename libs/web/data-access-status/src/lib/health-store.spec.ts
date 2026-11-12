import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { type WorkspaceHealth } from '@wsf/shared/schemas';
import { ApiRequestError } from '@wsf/web/core';
import { Subject } from 'rxjs';
import { HealthClient } from './health-client';
import { HealthStore } from './health-store';

test('loads entities, ignores overlapping requests, clears stale success on failure, and recovers on retry', (t) => {
  const requests: Subject<WorkspaceHealth>[] = [];
  const injector = Injector.create({
    providers: [
      HealthStore,
      {
        provide: HealthClient,
        useValue: {
          getHealth: () => {
            const request = new Subject<WorkspaceHealth>();
            requests.push(request);
            return request;
          },
        },
      },
    ],
  });
  t.after(() => injector.destroy());
  const store = injector.get(HealthStore);
  assert.equal(store.loading(), false);
  assert.equal(store.error(), null);
  assert.deepEqual(store.entities(), []);
  store.load();
  assert.equal(store.loading(), true);
  store.load();
  assert.equal(requests.length, 1);
  requests[0]?.next({ status: 'ok' });
  requests[0]?.complete();
  assert.equal(store.loading(), false);
  assert.deepEqual(store.entities(), [{ id: 'api', status: 'ok' }]);

  store.load();
  assert.deepEqual(store.entities(), []);
  requests[1]?.error(
    new ApiRequestError(new HttpErrorResponse({ status: 503 })),
  );
  assert.equal(store.loading(), false);
  assert.match(store.error() ?? '', /unavailable/);
  assert.deepEqual(store.entities(), []);

  store.load();
  assert.equal(store.error(), null);
  assert.equal(store.loading(), true);
  requests[2]?.next({ status: 'ok', database: 'up' });
  requests[2]?.complete();
  assert.equal(store.loading(), false);
  assert.deepEqual(store.entities(), [
    { id: 'api', status: 'ok', database: 'up' },
  ]);
});

test('keeps the method alive after invalid data and cancels work when the feature is destroyed', () => {
  const request = new Subject<WorkspaceHealth>();
  const pending = new Subject<WorkspaceHealth>();
  let calls = 0;
  const injector = Injector.create({
    providers: [
      HealthStore,
      {
        provide: HealthClient,
        useValue: { getHealth: () => (calls++ === 0 ? request : pending) },
      },
    ],
  });
  const store = injector.get(HealthStore);
  store.load();
  request.error(new Error('Invalid payload'));
  assert.equal(store.loading(), false);
  assert.match(store.error() ?? '', /invalid health response/);
  store.load();
  assert.equal(store.error(), null);
  assert.equal(store.loading(), true);
  assert.equal(pending.observed, true);
  injector.destroy();
  assert.equal(pending.observed, false);
});
