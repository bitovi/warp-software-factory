import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from '@wsf/web/data-access-auth';

export function safeReturnUrl(value: string | null): string {
  if (
    !value ||
    !/^\/(?!\/)/.test(value) ||
    /[\\\s%]/.test(value.split(/[?#]/)[0] ?? '')
  )
    return '/';
  try {
    const url = new URL(value, 'https://workspace.invalid');
    if (
      url.origin !== 'https://workspace.invalid' ||
      /^\/(?:login|signup)(?:[;/]|$)/i.test(url.pathname)
    )
      return '/';
    return value;
  } catch {
    return '/';
  }
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  await store.initialize();
  return store.status() === 'authenticated'
    ? true
    : router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url },
      });
};

export const guestGuard: CanActivateFn = async (route) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  await store.initialize();
  return store.status() === 'authenticated'
    ? router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')))
    : true;
};
