import {
  HttpErrorResponse,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { catchError, throwError } from 'rxjs';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

function isApiUrl(url: string): boolean {
  return url === '/api' || url.startsWith('/api/');
}

export const apiBaseUrlInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApiUrl(request.url)) return next(request);
  const baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  return next(request.clone({ url: baseUrl + request.url.slice(4) }));
};

export class ApiRequestError extends Error {
  constructor(readonly response: HttpErrorResponse) {
    super(
      [0, 502, 503, 504].includes(response.status)
        ? 'The API is unavailable. Check the API server and try again.'
        : `The API request failed (HTTP ${response.status}). Try again.`,
      { cause: response },
    );
    this.name = 'ApiRequestError';
  }
}

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApiUrl(request.url)) return next(request);
  return next(request).pipe(
    catchError((error: unknown) =>
      throwError(() =>
        error instanceof HttpErrorResponse ? new ApiRequestError(error) : error,
      ),
    ),
  );
};
