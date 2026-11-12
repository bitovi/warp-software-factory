import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { API_BASE_URL } from '@wsf/web/core';
import { provideAuth } from '@wsf/web/feature-auth';
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
    provideAuth(),
  ],
}).catch((error: unknown) => console.error(error));
