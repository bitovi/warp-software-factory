import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { ApiRequestError } from '@wsf/web/core';
import { TasksClient } from '@wsf/web/data-access-tasks';
import { throwError } from 'rxjs';
import { TasksPage } from './tasks-page';

class TasksPageState extends TasksPage {
  snapshot() {
    return {
      fieldErrors: this.fieldErrors(),
      message: this.message(),
      busy: this.busy(),
    };
  }
}

test('preserves structured validation errors wrapped by the API interceptor', () => {
  const injector = Injector.create({
    providers: [
      {
        provide: TasksClient,
        useValue: {
          list: () =>
            throwError(
              () =>
                new ApiRequestError(
                  new HttpErrorResponse({
                    status: 400,
                    error: {
                      statusCode: 400,
                      message: 'Validation failed',
                      fieldErrors: { search: ['Search is too long.'] },
                      formErrors: ['Unsupported query.'],
                    },
                  }),
                ),
            ),
        },
      },
    ],
  });
  try {
    const page = runInInjectionContext(injector, () => new TasksPageState());
    assert.deepEqual(page.snapshot(), {
      fieldErrors: { search: ['Search is too long.'] },
      message: 'Unsupported query.',
      busy: false,
    });
  } finally {
    injector.destroy();
  }
});

test('shows a safe error and stops loading when the task API requires login', () => {
  const injector = Injector.create({
    providers: [
      {
        provide: TasksClient,
        useValue: {
          list: () =>
            throwError(
              () =>
                new ApiRequestError(
                  new HttpErrorResponse({
                    status: 401,
                    error: { message: 'private server details' },
                  }),
                ),
            ),
        },
      },
    ],
  });
  try {
    const page = runInInjectionContext(injector, () => new TasksPageState());
    assert.deepEqual(page.snapshot(), {
      fieldErrors: {},
      message: 'Could not load or save tasks. Check the API and retry.',
      busy: false,
    });
  } finally {
    injector.destroy();
  }
});
