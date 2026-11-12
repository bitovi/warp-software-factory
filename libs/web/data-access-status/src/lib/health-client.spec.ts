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
import { HealthClient } from './health-client';

test('fetches and validates health, including database-ready and malformed responses', async () => {
  const injector = Injector.create({
    providers: [
      ...provideHttpClientTesting(),
      { provide: HttpHandler, useExisting: HttpBackend },
      HttpClient,
      HealthClient,
    ],
  });
  try {
    const client = injector.get(HealthClient);
    const http = injector.get(HttpTestingController);
    for (const response of [
      { status: 'ok' },
      { status: 'ok', database: 'up' },
    ]) {
      const result = firstValueFrom(client.getHealth());
      const request = http.expectOne('/api/health');
      assert.equal(request.request.method, 'GET');
      assert.equal(request.request.timeout, 10_000);
      request.flush(response);
      assert.deepEqual(await result, response);
    }
    const invalid = firstValueFrom(client.getHealth());
    http.expectOne('/api/health').flush({ message: 'not a health response' });
    await assert.rejects(invalid, { name: 'ZodError' });
    http.verify();
  } finally {
    injector.destroy();
  }
});
