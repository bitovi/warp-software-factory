import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workspaceStatusSchema, type WorkspaceStatus } from './index';

test('accepts a status response and infers the shared contract', () => {
  const response: WorkspaceStatus = { status: 'ok', service: 'api' };
  assert.deepEqual(workspaceStatusSchema.parse(response), response);
});

test('rejects missing, invalid, and unexpected response fields', () => {
  for (const response of [
    null,
    {},
    { status: 'ok' },
    { status: 'down', service: 'api' },
    { status: 'ok', service: 'web' },
    { status: 'ok', service: 'api', internal: 'private' },
  ]) {
    assert.equal(workspaceStatusSchema.safeParse(response).success, false);
  }
});
