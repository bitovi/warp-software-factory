import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SessionServicesCatalog,
  parseRate,
  type ServiceAccess,
  type ServiceDraft,
  type ServiceRecord,
} from './services-catalog';

const admin: ServiceAccess = {
  companyAdmin: true,
  permissions: ['rates:view'],
  currency: 'USD',
};
const draft: ServiceDraft = {
  name: 'Design',
  color: '#7c3aed',
  billable: true,
  defaultRateMinor: 12550,
};
const used: ServiceRecord = {
  ...draft,
  id: 'used',
  defaultRateMinor: 12550,
  usageCount: 2,
  status: 'active',
};

test('creates, edits, archives, restores, and deletes an unused service', async () => {
  const catalog = new SessionServicesCatalog(admin);
  await catalog.create({ ...draft, name: '  Design  ' });
  const service = catalog.services()[0];
  assert.ok(service);
  assert.equal(service.name, 'Design');
  assert.equal(service.defaultRateMinor, 12550);
  await catalog.update(service.id, {
    ...draft,
    name: 'Research',
    color: '#059669',
    billable: false,
    defaultRateMinor: 0,
  });
  assert.deepEqual(catalog.services()[0], {
    ...service,
    name: 'Research',
    color: '#059669',
    billable: false,
    defaultRateMinor: 0,
  });
  assert.deepEqual(catalog.activeOptions(), [
    { id: service.id, name: 'Research', color: '#059669' },
  ]);
  await catalog.archive(service.id);
  assert.equal(catalog.services()[0]?.status, 'archived');
  assert.deepEqual(catalog.activeOptions(), []);
  await catalog.restore(service.id);
  assert.equal(catalog.services()[0]?.status, 'active');
  assert.equal(catalog.activeOptions()[0]?.id, service.id);
  await catalog.delete(service.id);
  assert.deepEqual(catalog.services(), []);
  assert.deepEqual(catalog.activeOptions(), []);
});

test('rejects invalid drafts and duplicate names without changing the catalog', async () => {
  const catalog = new SessionServicesCatalog(admin, [used]);
  for (const invalid of [
    { name: '   ' },
    { name: 'a'.repeat(81) },
    { color: 'not-a-color' },
    { defaultRateMinor: -1 },
    { defaultRateMinor: 1.5 },
    { defaultRateMinor: Infinity },
    { defaultRateMinor: 100_000_000 },
    { name: ' DESIGN ' },
  ]) {
    await assert.rejects(catalog.create({ ...draft, ...invalid }));
  }
  await assert.rejects(catalog.update('missing', draft), /no longer exists/);
  await assert.rejects(catalog.archive('missing'), /no longer exists/);
  await catalog.update(used.id, draft);
  assert.deepEqual(catalog.services(), [used]);
  await catalog.archive(used.id);
  await assert.rejects(catalog.create(draft), /already exists/);
});

test('protects used services from deletion even when archived', async () => {
  const catalog = new SessionServicesCatalog(admin, [used]);
  await assert.rejects(catalog.delete(used.id), /in use/);
  await catalog.archive(used.id);
  await assert.rejects(catalog.delete(used.id), /in use/);
  assert.equal(catalog.services().length, 1);
  assert.deepEqual(catalog.activeOptions(), []);
});

test('denies every mutation without company admin access', async () => {
  const catalog = new SessionServicesCatalog(
    { ...admin, companyAdmin: false },
    [used],
  );
  for (const operation of [
    () => catalog.create(draft),
    () => catalog.update(used.id, draft),
    () => catalog.archive(used.id),
    () => catalog.restore(used.id),
    () => catalog.delete(used.id),
  ]) {
    await assert.rejects(operation(), /Only company admins/);
  }
  assert.deepEqual(catalog.services(), [used]);
});

test('omits sensitive rate values and preserves rates during edits without rates:view', async () => {
  const catalog = new SessionServicesCatalog({ ...admin, permissions: [] }, [
    used,
  ]);
  assert.equal(
    Object.hasOwn(catalog.services()[0] ?? {}, 'defaultRateMinor'),
    false,
  );
  assert.equal(JSON.stringify(catalog.services()).includes('12550'), false);
  assert.deepEqual(catalog.activeOptions(), [
    { id: 'used', name: 'Design', color: '#7c3aed' },
  ]);
  await assert.rejects(
    catalog.update(used.id, draft),
    /permission to change rates/,
  );
  await catalog.update(used.id, {
    name: 'Updated design',
    color: '#059669',
    billable: false,
  });
  assert.equal(
    Object.hasOwn(catalog.services()[0] ?? {}, 'defaultRateMinor'),
    false,
  );
  await catalog.create({ name: 'Planning', color: '#2563eb', billable: true });
  assert.equal(catalog.services().length, 2);
});

test('parses currency precision exactly and rejects invalid or excessive rates', () => {
  assert.equal(parseRate('125.50', 'USD'), 12550);
  assert.equal(parseRate('0', 'USD'), 0);
  assert.equal(parseRate('125', 'JPY'), 125);
  assert.equal(parseRate('1.125', 'KWD'), 1125);
  for (const invalid of [
    '',
    '-1',
    '1.001',
    '1e3',
    'NaN',
    'Infinity',
    '9999999999',
  ]) {
    assert.throws(() => parseRate(invalid, 'USD'));
  }
  assert.throws(() => parseRate('1.1', 'JPY'));
});
