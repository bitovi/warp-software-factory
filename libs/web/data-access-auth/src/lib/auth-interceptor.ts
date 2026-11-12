import {
  HttpErrorResponse,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth-store';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!(request.url === '/api' || request.url.startsWith('/api/')))
    return next(request);
  const path = request.url.split('?')[0];
  if (
    [
      '/api/auth/login',
      '/api/auth/signup',
      '/api/auth/refresh',
      '/api/auth/logout',
    ].includes(path ?? '')
  ) {
    return next(request);
  }
  const store = inject(AuthStore);
  const token = store.accessToken();
  const version = store.sessionVersion();
  const authorized = (value: string) =>
    request.clone({
      setHeaders: { Authorization: `Bearer ${value}` },
    });
  return next(token ? authorized(token) : request).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        !token ||
        store.sessionVersion() !== version ||
        store.status() !== 'authenticated'
      ) {
        return throwError(() => error);
      }
      const currentToken = store.accessToken();
      return from(
        currentToken && currentToken !== token
          ? Promise.resolve(currentToken)
          : store.refresh(),
      ).pipe(
        switchMap((refreshed) => {
          if (store.sessionVersion() !== version)
            return throwError(() => error);
          return next(authorized(refreshed)).pipe(
            catchError((retryError: unknown) => {
              if (
                retryError instanceof HttpErrorResponse &&
                retryError.status === 401 &&
                store.sessionVersion() === version
              )
                void store.logout();
              return throwError(() => retryError);
            }),
          );
        }),
      );
    }),
  );
};
