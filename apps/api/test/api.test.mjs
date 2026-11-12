import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';

test('serves shared status and task contracts under the API prefix', async (t) => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve) => reservation.close(resolve));

  const server = spawn(process.execPath, ['dist/apps/api/main.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  server.stderr.on('data', (chunk) => (output += chunk));
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const closed = once(server, 'exit');
      server.kill('SIGTERM');
      await closed;
    }
  });

  const url = `http://127.0.0.1:${port}`;
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, output);
    try {
      response = await fetch(`${url}/api/status`);
      break;
    } catch {
      await setTimeout(100);
    }
  }
  assert.ok(response, `API did not start: ${output}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'api' });
  assert.equal((await fetch(`${url}/status`)).status, 404);

  const send = (path, method, body) =>
    fetch(`${url}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  await t.test(
    'returns structured field errors for invalid requests',
    async () => {
      const invalid = await send('/tasks', 'POST', {
        title: ' ',
        completed: 'yes',
      });
      assert.equal(invalid.status, 400);
      const error = await invalid.json();
      assert.equal(error.statusCode, 400);
      assert.equal(error.message, 'Validation failed');
      assert.deepEqual(error.formErrors, []);
      assert.deepEqual(error.fieldErrors.title, ['Enter a task title.']);
      assert.ok(error.fieldErrors.completed.length > 0);

      const unknown = await send('/tasks', 'POST', {
        title: 'Task',
        internal: true,
      });
      assert.equal(unknown.status, 400);
      assert.ok((await unknown.json()).formErrors.length > 0);

      for (const query of [
        'page=0',
        'page=1&page=2',
        'pageSize=101',
        'sort=invalid',
        `search=${'x'.repeat(121)}`,
      ]) {
        const response = await fetch(`${url}/api/tasks?${query}`);
        assert.equal(response.status, 400, query);
        const error = await response.json();
        const field = query.split('=')[0];
        assert.ok(error.fieldErrors[field].length > 0, query);
      }
      const list = await fetch(`${url}/api/tasks`);
      assert.deepEqual(await list.json(), {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      });
    },
  );

  await t.test(
    'creates, partially updates, searches, sorts and paginates tasks',
    async () => {
      const created = await send('/tasks', 'POST', { title: '  Alpha task  ' });
      assert.equal(created.status, 201);
      const alpha = await created.json();
      assert.match(alpha.id, /^[0-9a-f-]{36}$/);
      assert.deepEqual(alpha, {
        id: alpha.id,
        title: 'Alpha task',
        completed: false,
      });

      const completed = await send(`/tasks/${alpha.id}`, 'PATCH', {
        completed: true,
      });
      assert.equal(completed.status, 200);
      assert.deepEqual(await completed.json(), { ...alpha, completed: true });

      const renamed = await send(`/tasks/${alpha.id}`, 'PATCH', {
        title: '  Alpha renamed  ',
      });
      assert.equal(renamed.status, 200);
      const updated = await renamed.json();
      assert.deepEqual(updated, {
        ...alpha,
        title: 'Alpha renamed',
        completed: true,
      });

      for (const body of [
        {},
        { title: '' },
        { completed: 'true' },
        { id: alpha.id },
      ]) {
        const invalid = await send(`/tasks/${alpha.id}`, 'PATCH', body);
        assert.equal(invalid.status, 400);
        const error = await invalid.json();
        assert.equal(error.message, 'Validation failed');
        if ('title' in body) assert.ok(error.fieldErrors.title.length > 0);
        else if ('completed' in body) {
          assert.ok(error.fieldErrors.completed.length > 0);
        } else assert.ok(error.formErrors.length > 0);
      }

      const beta = await send('/tasks', 'POST', { title: 'Beta task' });
      assert.equal(beta.status, 201);
      const gamma = await send('/tasks', 'POST', { title: 'Gamma task' });
      assert.equal(gamma.status, 201);
      const listed = await fetch(
        `${url}/api/tasks?page=2&pageSize=1&sort=desc&search=TASK`,
      );
      assert.equal(listed.status, 200);
      assert.deepEqual(await listed.json(), {
        items: [await beta.json()],
        total: 2,
        page: 2,
        pageSize: 1,
      });

      const unchanged = await fetch(`${url}/api/tasks?search=renamed`);
      assert.deepEqual((await unchanged.json()).items, [updated]);
      const beyond = await fetch(`${url}/api/tasks?page=10`);
      assert.deepEqual((await beyond.json()).items, []);
      const missing = await send(
        '/tasks/738dbdca-09d8-47d9-af39-3fb3663fd71c',
        'PATCH',
        { completed: true },
      );
      assert.equal(missing.status, 404);
    },
  );
});
