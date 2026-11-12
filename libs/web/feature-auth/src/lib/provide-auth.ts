import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { apiBaseUrlInterceptor, apiErrorInterceptor } from '@wsf/web/core';
import { AuthStore, authInterceptor } from '@wsf/web/data-access-auth';

export function provideAuth() {
  return makeEnvironmentProviders([
    provideHttpClient(
      withInterceptors([
        apiErrorInterceptor,
        authInterceptor,
        apiBaseUrlInterceptor,
      ]),
    ),
    provideAppInitializer(() => inject(AuthStore).initialize()),
  ]);
}
