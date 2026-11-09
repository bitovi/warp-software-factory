import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createProjectGraphAsync } from '@nx/devkit';
import { ESLint } from 'eslint';

const eslint = new ESLint();
before(async () => {
  await createProjectGraphAsync();
});

async function boundaryMessages(filePath, source) {
  const [result] = await eslint.lintText(source, { filePath });
  assert.equal(result.fatalErrorCount, 0);
  return result.messages.filter(
    (message) => message.ruleId === '@nx/enforce-module-boundaries',
  );
}

test('web cannot import an API library', async () => {
  const messages = await boundaryMessages(
    'apps/web/src/app/app.ts',
    "import { configureApi } from '@wsf/api/core';\nvoid configureApi;",
  );
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /scope:web.*scope:shared/);
});

test('API cannot import a web library', async () => {
  const messages = await boundaryMessages(
    'apps/api/src/main.ts',
    "import { StatusPage } from '@wsf/web/feature-status';\nvoid StatusPage;",
  );
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /scope:api.*scope:shared/);
});

test('UI cannot depend on data access in the same scope', async () => {
  const messages = await boundaryMessages(
    'libs/web/ui/src/index.ts',
    "export { StatusClient } from '@wsf/web/data-access-status';",
  );
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /type:ui.*type:util/);
});

test('shared libraries cannot depend on an API library', async () => {
  const messages = await boundaryMessages(
    'libs/shared/schemas/src/index.ts',
    "export { configureApi } from '@wsf/api/core';",
  );
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /scope:shared/);
});

test('both scopes can consume the shared schema', async () => {
  for (const filePath of [
    'libs/web/data-access-status/src/index.ts',
    'libs/api/feature-status/src/index.ts',
  ]) {
    assert.deepEqual(
      await boundaryMessages(
        filePath,
        "export { workspaceStatusSchema } from '@wsf/shared/schemas';",
      ),
      [],
    );
  }
});
