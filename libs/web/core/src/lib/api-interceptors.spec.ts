import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HttpErrorResponse,
  HttpParams,
  HttpRequest,
  HttpResponse,
  type HttpHandlerFn,
} from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import {
  API_BASE_URL,
  ApiRequestError,
  apiBaseUrlInterceptor,
  apiErrorInterceptor,
} from './api-interceptors';

test('rewrites only API paths and preserves query parameters and request properties', async () => {
  const injector = Injector.create({
    providers: [
      { provide: API_BASE_URL, useValue: 'https://example.test/backend/api/' },
    ],
  });
  try {
    const request = new HttpRequest('GET', '/api/health', {
      params: new HttpParams().set('detail', 'readiness check'),
      withCredentials: true,
    });
    const next: HttpHandlerFn = (rewritten) => {
      assert.equal(rewritten.url, 'https://example.test/backend/api/health');
      assert.equal(
        rewritten.urlWithParams,
        'https://example.test/backend/api/health?detail=readiness%20check',
      );
      assert.equal(rewritten.withCredentials, true);
      assert.equal(rewritten.method, request.method);
      return of(new HttpResponse({ status: 200 }));
    };
    await firstValueFrom(
      runInInjectionContext(injector, () =>
        apiBaseUrlInterceptor(request, next),
      ),
    );
    for (const url of [
      '/assets/theme.css',
      '/apiary',
      'https://other.test/api/health',
    ]) {
      const other = new HttpRequest('GET', url);
      await firstValueFrom(
        runInInjectionContext(injector, () =>
          apiBaseUrlInterceptor(other, (unchanged) => {
            assert.equal(unchanged, other);
            return of(new HttpResponse());
          }),
        ),
      );
    }
  } finally {
    injector.destroy();
  }
});

test('normalizes API errors before URL rewriting and preserves the original cause', async () => {
  const injector = Injector.create({
    providers: [{ provide: API_BASE_URL, useValue: '/api' }],
  });
  try {
    for (const status of [0, 503, 401]) {
      const failure = new HttpErrorResponse({
        status,
        error: 'private server details',
      });
      const result = runInInjectionContext(injector, () =>
        apiErrorInterceptor(new HttpRequest('GET', '/api/health'), (request) =>
          apiBaseUrlInterceptor(request, () => throwError(() => failure)),
        ),
      );
      await assert.rejects(firstValueFrom(result), (error: unknown) => {
        assert.ok(error instanceof ApiRequestError);
        assert.equal(error.response.status, status);
        assert.equal(error.cause, failure);
        assert.doesNotMatch(error.message, /private server details/);
        assert.match(
          error.message,
          status === 401 ? /HTTP 401/ : /unavailable/,
        );
        return true;
      });
    }
    const failure = new HttpErrorResponse({ status: 404 });
    await assert.rejects(
      firstValueFrom(
        apiErrorInterceptor(new HttpRequest('GET', '/assets/missing'), () =>
          throwError(() => failure),
        ),
      ),
      (error: unknown) => error === failure,
    );
  } finally {
    injector.destroy();
  }
});
