import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';

test('serves the shared status contract under the API prefix', async (t) => {
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
});
