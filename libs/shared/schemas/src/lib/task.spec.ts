import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CreateTaskSchema,
  PaginationQuerySchema,
  TaskQuerySchema,
  TaskResponseSchema,
  UpdateTaskSchema,
} from '../index';

test('create normalizes a title and supplies the completion default', () => {
  assert.deepEqual(CreateTaskSchema.parse({ title: '  Ship contracts  ' }), {
    title: 'Ship contracts',
    completed: false,
  });
  for (const input of [
    {},
    { title: ' ' },
    { title: 'x'.repeat(121) },
    { title: 'Task', completed: 'false' },
    { title: 'Task', id: 'client-assigned' },
  ]) {
    assert.equal(CreateTaskSchema.safeParse(input).success, false);
  }
});

test('partial updates preserve omitted fields and reject empty or invalid changes', () => {
  assert.deepEqual(UpdateTaskSchema.parse({ title: '  Renamed  ' }), {
    title: 'Renamed',
  });
  assert.deepEqual(UpdateTaskSchema.parse({ completed: true }), {
    completed: true,
  });
  for (const input of [
    {},
    { title: '' },
    { completed: null },
    { completed: 'true' },
    { unexpected: true },
  ]) {
    assert.equal(UpdateTaskSchema.safeParse(input).success, false);
  }
});

test('queries default, normalize and bound pagination without broad coercion', () => {
  assert.deepEqual(PaginationQuerySchema.parse({}), { page: 1, pageSize: 10 });
  assert.deepEqual(TaskQuerySchema.parse({}), {
    page: 1,
    pageSize: 10,
    sort: 'asc',
    search: '',
  });
  assert.deepEqual(
    TaskQuerySchema.parse({
      page: '2',
      pageSize: '100',
      sort: 'desc',
      search: '  Contract  ',
    }),
    { page: 2, pageSize: 100, sort: 'desc', search: 'Contract' },
  );
  for (const input of [
    { page: 0 },
    { page: '-1' },
    { page: '1.5' },
    { page: 'not-a-page' },
    { page: '' },
    { page: null },
    { page: true },
    { page: ['1'] },
    { page: Number.MAX_SAFE_INTEGER + 1 },
    { pageSize: 101 },
    { sort: 'title' },
    { search: 'x'.repeat(121) },
    { search: ['one', 'two'] },
    { unknown: 'value' },
  ]) {
    assert.equal(TaskQuerySchema.safeParse(input).success, false);
  }
});

test('responses require server identity and completion instead of applying request defaults', () => {
  const task = {
    id: '738dbdca-09d8-47d9-af39-3fb3663fd71c',
    title: 'Ship contracts',
    completed: false,
  };
  assert.deepEqual(TaskResponseSchema.parse(task), task);
  assert.equal(
    TaskResponseSchema.safeParse({ id: task.id, title: task.title }).success,
    false,
  );
  assert.equal(
    TaskResponseSchema.safeParse({ ...task, id: 'invalid' }).success,
    false,
  );
  assert.equal(
    TaskResponseSchema.safeParse({ ...task, internal: true }).success,
    false,
  );
});
