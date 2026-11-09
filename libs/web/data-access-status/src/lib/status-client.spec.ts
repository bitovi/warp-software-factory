import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpBackend, HttpClient, HttpHandler } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StatusClient } from './status-client';

test('validates successful status responses and rejects invalid API data', async () => {
  const injector = Injector.create({
    providers: [
      ...provideHttpClientTesting(),
      { provide: HttpHandler, useExisting: HttpBackend },
      HttpClient,
      StatusClient,
    ],
  });
  try {
    const client = injector.get(StatusClient);
    const http = injector.get(HttpTestingController);
    const valid = firstValueFrom(client.getStatus());
    const request = http.expectOne('/api/status');
    assert.equal(request.request.method, 'GET');
    request.flush({ status: 'ok', service: 'api' });
    assert.deepEqual(await valid, { status: 'ok', service: 'api' });

    const invalid = firstValueFrom(client.getStatus());
    http.expectOne('/api/status').flush({ status: 'ok', service: 'other' });
    await assert.rejects(invalid, { name: 'ZodError' });

    const unavailable = firstValueFrom(client.getStatus());
    http.expectOne('/api/status').flush('Unavailable', {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await assert.rejects(unavailable, { status: 503 });
    http.verify();
  } finally {
    injector.destroy();
  }
});
