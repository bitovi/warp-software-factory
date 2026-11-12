import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpHandler,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Injector } from '@angular/core';
import {
  TaskQuerySchema,
  ValidationErrorResponseSchema,
  type CreateTask,
  type TaskResponse,
  type ValidationErrorResponse,
} from '@wsf/shared/schemas';
import { firstValueFrom } from 'rxjs';
import { TasksClient } from './tasks-client';

test('uses shared create/update/query contracts and validates every response', async () => {
  const injector = Injector.create({
    providers: [
      ...provideHttpClientTesting(),
      { provide: HttpHandler, useExisting: HttpBackend },
      HttpClient,
      TasksClient,
    ],
  });
  try {
    const client = injector.get(TasksClient);
    const http = injector.get(HttpTestingController);
    const input: CreateTask = { title: 'Ship contracts', completed: false };
    const task: TaskResponse = {
      ...input,
      id: '738dbdca-09d8-47d9-af39-3fb3663fd71c',
    };

    const created = firstValueFrom(client.create(input));
    const post = http.expectOne('/api/tasks');
    assert.equal(post.request.method, 'POST');
    assert.deepEqual(post.request.body, input);
    post.flush(task);
    assert.deepEqual(await created, task);

    const updated = firstValueFrom(client.update(task.id, { completed: true }));
    const patch = http.expectOne(`/api/tasks/${task.id}`);
    assert.equal(patch.request.method, 'PATCH');
    assert.deepEqual(patch.request.body, { completed: true });
    patch.flush({ ...task, completed: true });
    assert.deepEqual(await updated, { ...task, completed: true });

    const query = TaskQuerySchema.parse({
      page: 2,
      pageSize: 5,
      sort: 'desc',
      search: 'contracts & forms',
    });
    const listed = firstValueFrom(client.list(query));
    const get = http.expectOne((request) => request.method === 'GET');
    assert.equal(get.request.url, '/api/tasks');
    for (const [key, value] of Object.entries(query)) {
      assert.equal(get.request.params.get(key), String(value));
    }
    const page = { items: [task], total: 6, page: 2, pageSize: 5 };
    get.flush(page);
    assert.deepEqual(await listed, page);

    const invalidCreate = firstValueFrom(client.create(input));
    http.expectOne('/api/tasks').flush({ ...task, id: 'invalid' });
    await assert.rejects(invalidCreate, { name: 'ZodError' });

    const invalidUpdate = firstValueFrom(
      client.update(task.id, { completed: true }),
    );
    http.expectOne(`/api/tasks/${task.id}`).flush({
      id: task.id,
      title: task.title,
    });
    await assert.rejects(invalidUpdate, { name: 'ZodError' });

    const invalidList = firstValueFrom(client.list(query));
    http
      .expectOne((request) => request.method === 'GET')
      .flush({ ...page, items: [{ ...task, completed: 'yes' }] });
    await assert.rejects(invalidList, { name: 'ZodError' });

    const rejected = firstValueFrom(client.create(input));
    const error: ValidationErrorResponse = {
      statusCode: 400,
      message: 'Validation failed',
      fieldErrors: { title: ['Enter a task title.'] },
      formErrors: [],
      error: 'BadRequestException',
      path: '/api/tasks',
      timestamp: '2026-11-12T19:00:00.000Z',
    };
    http.expectOne('/api/tasks').flush(error, {
      status: 400,
      statusText: 'Bad Request',
    });
    await assert.rejects(rejected, (caught: unknown) => {
      assert.ok(caught instanceof HttpErrorResponse);
      assert.equal(caught.status, 400);
      assert.deepEqual(
        ValidationErrorResponseSchema.parse(caught.error),
        error,
      );
      return true;
    });
    http.verify();
  } finally {
    injector.destroy();
  }
});
