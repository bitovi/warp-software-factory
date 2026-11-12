import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { config } from 'dotenv';

test('serves shared status and task contracts under the API prefix', async (t) => {
  const loaded = config({ path: '.env.test', override: true, quiet: true });
  assert.ifError(loaded.error);
  assert.equal(process.env.NODE_ENV, 'test');
  assert.match(process.env.DB_NAME ?? '', /_test$/);
  const database = createRequire(import.meta.url)(
    '../../../dist/apps/api/database/data-source.js',
  ).default;
  await database.initialize();
  let ownsMigrations = false;
  t.after(async () => {
    try {
      if (ownsMigrations) {
        for (let index = 0; index < 3; index++)
          await database.undoLastMigration();
      }
    } finally {
      await database.destroy();
    }
  });
  assert.deepEqual(
    await database.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'app'`,
    ),
    [],
  );
  await database.runMigrations();
  ownsMigrations = true;

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
  const health = await fetch(`${url}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', database: 'up' });
  assert.equal((await fetch(`${url}/health`)).status, 404);

  const publicSend = (path, body) =>
    fetch(`${url}/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(body),
    });

  assert.equal((await fetch(`${url}/api/tasks`)).status, 401);
  const account = {
    email: `${randomUUID()}@example.com`,
    password: 'a long demo passphrase',
    firstName: 'Demo',
    lastName: 'User',
    companyName: 'Demo',
  };
  assert.equal((await publicSend('/auth/signup', account)).status, 201, output);
  const login = await publicSend('/auth/login', {
    email: account.email,
    password: account.password,
  });
  assert.equal(login.status, 200);
  const { accessToken } = await login.json();
  const authenticatedFetch = (url, options = {}) =>
    fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    });
  const send = (path, method, body) =>
    authenticatedFetch(`${url}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  await t.test(
    'validates signup with field-level errors in the compiled API',
    async () => {
      const response = await send('/auth/signup', 'POST', {
        email: 'owner@example.com',
        password: 'weak-secret',
        firstName: 'Ada',
        lastName: 'Lovelace',
        companyName: 'Analytical Engines',
      });
      assert.equal(response.status, 400);
      const error = await response.json();
      assert.deepEqual(error.fieldErrors.password, [
        'Use at least 12 characters.',
      ]);
      assert.doesNotMatch(
        JSON.stringify(error),
        /weak-secret|passwordHash|argon2/,
      );
    },
  );

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
        const response = await authenticatedFetch(`${url}/api/tasks?${query}`);
        assert.equal(response.status, 400, query);
        const error = await response.json();
        const field = query.split('=')[0];
        assert.ok(error.fieldErrors[field].length > 0, query);
      }
      const list = await authenticatedFetch(`${url}/api/tasks`);
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
      const listed = await authenticatedFetch(
        `${url}/api/tasks?page=2&pageSize=1&sort=desc&search=TASK`,
      );
      assert.equal(listed.status, 200);
      assert.deepEqual(await listed.json(), {
        items: [await beta.json()],
        total: 2,
        page: 2,
        pageSize: 1,
      });

      const unchanged = await authenticatedFetch(
        `${url}/api/tasks?search=renamed`,
      );
      assert.deepEqual((await unchanged.json()).items, [updated]);
      const beyond = await authenticatedFetch(`${url}/api/tasks?page=10`);
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
