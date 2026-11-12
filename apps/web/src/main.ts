import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import {
  API_BASE_URL,
  apiBaseUrlInterceptor,
  apiErrorInterceptor,
} from '@wsf/web/core';
import { App } from './app/app';
import { appRoutes } from './app/app.routes';
import { environment } from './environments/environment';

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      appRoutes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
    provideHttpClient(
      withInterceptors([apiErrorInterceptor, apiBaseUrlInterceptor]),
    ),
  ],
}).catch((error: unknown) => console.error(error));
