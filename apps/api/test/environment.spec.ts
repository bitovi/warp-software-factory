import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { validateEnvironment } from '../src/config/environment';
import { databaseOptions } from '../src/database-options';

const required = {
  DB_HOST: ' localhost ',
  DB_NAME: ' api_test ',
  DB_USER: ' api ',
  DB_PASSWORD: ' test-only ',
};

describe('environment validation', () => {
  it('parses defaults and trims identifiers without changing passwords', () => {
    assert.deepEqual(
      validateEnvironment({ ...required, UNRELATED: 'ignored' }),
      {
        NODE_ENV: 'development',
        PORT: 3000,
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'api_test',
        DB_USER: 'api',
        DB_PASSWORD: required.DB_PASSWORD,
        DB_SSL: false,
      },
    );
  });

  it('parses explicit ports and SSL without truthy-string coercion', () => {
    const env = validateEnvironment({
      ...required,
      NODE_ENV: 'production',
      PORT: '65535',
      DB_PORT: '1',
      DB_SSL: 'true',
    });
    assert.equal(env.PORT, 65535);
    assert.equal(env.DB_PORT, 1);
    assert.equal(env.DB_SSL, true);
    const options = databaseOptions(env);
    assert.equal(options.synchronize, false);
    assert.equal(options.migrationsRun, false);
    assert.deepEqual(options.ssl, { rejectUnauthorized: true });
    assert.equal(databaseOptions(validateEnvironment(required)).ssl, false);
  });

  it('rejects missing and blank required values and reports all affected fields', () => {
    assert.throws(
      () =>
        validateEnvironment({
          DB_HOST: ' ',
          DB_NAME: '',
          DB_PASSWORD: '',
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
          assert.match(error.message, new RegExp(name));
        }
        return true;
      },
    );
  });

  it('rejects invalid ports, modes, and booleans without leaking input values', () => {
    for (const key of ['PORT', 'DB_PORT']) {
      for (const value of [
        '',
        '0',
        '65536',
        '-1',
        '1.2',
        '1e3',
        ' 5432 ',
        'abc',
      ]) {
        assert.throws(
          () => validateEnvironment({ ...required, [key]: value }),
          new RegExp(key),
        );
      }
    }
    for (const [key, value] of [
      ['NODE_ENV', 'private-input'],
      ['DB_SSL', 'private-input'],
    ] as const) {
      assert.throws(
        () => validateEnvironment({ ...required, [key]: value }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, new RegExp(key));
          assert.doesNotMatch(error.message, /private-input|test-only/);
          return true;
        },
      );
    }
  });

  it('stops the API process before connecting when configuration is invalid', () => {
    const result = spawnSync(process.execPath, ['dist/apps/api/main.js'], {
      env: {
        ...process.env,
        ...required,
        DB_PORT: 'invalid-port',
      },
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    const output = result.stdout + result.stderr;
    assert.match(output, /Invalid environment configuration/);
    assert.match(output, /DB_PORT/);
    assert.doesNotMatch(output, /test-only|Unable to connect/);
  });
});
