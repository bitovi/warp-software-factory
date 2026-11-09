import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Injector, signal } from '@angular/core';
import { strFromU8, unzipSync } from 'fflate';
import {
  DEFAULT_FILTERS,
  filterEntries,
  filtersFromUrl,
  filtersToUrl,
  normalizeFilters,
  Permission,
  ReportFilters,
  TimeEntry,
} from './reports-model';
import { REPORTS_SOURCE } from './reports-source';
import { ReportsStore } from './reports-store';
import {
  createExport,
  csvContent,
  exportRows,
  ReportSnapshot,
  spreadsheetText,
} from './reports-export';

const entries: TimeEntry[] = [
  {
    id: '1',
    date: '2026-11-02',
    project: 'Website',
    client: 'Acme',
    person: 'Alex',
    description: 'Discovery',
    minutes: 90,
    billable: true,
    status: 'approved',
    amount: 217.5,
  },
  {
    id: '2',
    date: '2026-11-08',
    project: 'Mobile',
    client: 'Northstar',
    person: 'Sam',
    description: 'Prototype',
    minutes: 120,
    billable: false,
    status: 'pending',
    amount: 0,
  },
  {
    id: '3',
    date: '2026-11-03',
    project: 'Website',
    client: 'Acme',
    person: 'Sam',
    description: 'Implementation',
    minutes: 180,
    billable: true,
    status: 'draft',
    amount: 435,
  },
  {
    id: '4',
    date: '2026-11-01',
    project: 'Website',
    client: 'Acme',
    person: 'Alex',
    description: 'Earlier work',
    minutes: 60,
    billable: true,
    status: 'approved',
    amount: 145,
  },
];

function setup() {
  const permissions = signal<readonly Permission[]>([
    'reports:view',
    'reports:financial',
  ]);
  const source = signal<readonly TimeEntry[]>(structuredClone(entries));
  const injector = Injector.create({
    providers: [
      { provide: REPORTS_SOURCE, useValue: { entries: source, permissions } },
      ReportsStore,
    ],
  });
  return { store: injector.get(ReportsStore), permissions, source, injector };
}

test('URL round trip retains all filters, grouping and view without consuming unrelated query state', () => {
  const filters = {
    ...DEFAULT_FILTERS,
    projects: ['Website', 'Mobile', 'Website'],
    clients: ['Acme'],
    people: ['Sam'],
    billable: 'yes' as const,
    status: 'approved' as const,
    groupBy: 'client' as const,
    view: 'detailed' as const,
    split: 'client' as const,
  };
  const params = filtersToUrl(
    filters,
    new URLSearchParams('workspace=demo&project=old'),
  );
  assert.equal(params.get('workspace'), 'demo');
  assert.deepEqual(params.getAll('project'), ['Mobile', 'Website']);
  assert.deepEqual(filtersFromUrl(params), normalizeFilters(filters));
  assert.deepEqual(filtersFromUrl(new URLSearchParams()), DEFAULT_FILTERS);
});

test('malformed URL dates and enum values fall back safely; reverse ranges normalize', () => {
  assert.deepEqual(
    filtersFromUrl(
      new URLSearchParams(
        'from=2026-02-30&to=bad&billable=maybe&status=private&group=amount&view=raw&split=rate',
      ),
    ),
    DEFAULT_FILTERS,
  );
  const reversed = filtersFromUrl(
    new URLSearchParams('from=2026-11-08&to=2026-11-02'),
  );
  assert.equal(reversed.from, '2026-11-02');
  assert.equal(reversed.to, '2026-11-08');
});

test('date bounds are inclusive, multi-selects union within a field and intersect across fields', () => {
  const ids = (patch: Partial<ReportFilters>) =>
    filterEntries(entries, { ...DEFAULT_FILTERS, ...patch }).map(
      (entry) => entry.id,
    );
  assert.deepEqual(ids({}), ['1', '3', '2']);
  assert.deepEqual(ids({ projects: ['Website', 'Mobile'], people: ['Sam'] }), [
    '3',
    '2',
  ]);
  assert.deepEqual(ids({ clients: ['Acme'] }), ['1', '3']);
  assert.deepEqual(ids({ projects: ['Website'], clients: ['Northstar'] }), []);
  assert.deepEqual(ids({ billable: 'no' }), ['2']);
  assert.deepEqual(ids({ status: 'draft' }), ['3']);
  assert.deepEqual(
    ids({
      projects: ['Website'],
      clients: ['Acme'],
      people: ['Alex'],
      billable: 'yes',
      status: 'approved',
    }),
    ['1'],
  );
  assert.deepEqual(ids({ projects: ['not available'] }), []);
});

test('signal updates recompute cards, groups and both charts from the same selected entries', () => {
  const { store, source, injector } = setup();
  try {
    assert.deepEqual(store.summary(), {
      hours: 6.5,
      billableHours: 4.5,
      billablePercent: (4.5 / 6.5) * 100,
      amount: 652.5,
    });
    store.update({ people: ['Sam'], groupBy: 'client', split: 'client' });
    assert.equal(store.summary().hours, 5);
    assert.deepEqual(
      store.groups().map((group) => [group.name, group.summary.hours]),
      [
        ['Acme', 3],
        ['Northstar', 2],
      ],
    );
    assert.equal(
      store.trend().reduce((total, point) => total + point.hours, 0),
      5,
    );
    assert.deepEqual(store.split(), [
      { label: 'Acme', hours: 3 },
      { label: 'Northstar', hours: 2 },
    ]);
    source.set([]);
    assert.deepEqual(store.summary(), {
      hours: 0,
      billableHours: 0,
      billablePercent: 0,
      amount: 0,
    });
    assert.deepEqual(store.groups(), []);
    assert.deepEqual(store.trend(), []);
    assert.deepEqual(store.split(), []);
    store.reset();
    assert.deepEqual(store.filters(), DEFAULT_FILTERS);
  } finally {
    injector.destroy();
  }
});

test('permission revocation removes amounts from entries, groups, summaries, and snapshots, then hides all report data', () => {
  const { store, permissions, injector } = setup();
  try {
    assert.equal(store.canViewFinancial(), true);
    permissions.set(['reports:view']);
    assert.equal(store.canView(), true);
    assert.equal(store.canViewFinancial(), false);
    assert.ok(store.entries().every((entry) => !('amount' in entry)));
    assert.ok(store.groups().every((group) => !('amount' in group.summary)));
    assert.ok(!('amount' in store.summary()));
    assert.ok(store.snapshot().entries.every((entry) => !('amount' in entry)));
    permissions.set(['reports:financial']);
    assert.equal(store.canView(), false);
    assert.deepEqual(store.entries(), []);
    assert.deepEqual(store.options(), {
      projects: [],
      clients: [],
      people: [],
    });
    assert.deepEqual(store.groups(), []);
    assert.deepEqual(store.split(), []);
    assert.throws(() => store.snapshot(), /access is required/);
  } finally {
    injector.destroy();
  }
});

test('export snapshot is stable while filters, source data and permissions change', () => {
  const { store, source, permissions, injector } = setup();
  try {
    store.update({ projects: ['Website'], groupBy: 'client' });
    const snapshot = store.snapshot();
    store.update({ projects: ['Mobile'] });
    source.set([]);
    permissions.set([]);
    assert.deepEqual(
      snapshot.entries.map((entry) => entry.id),
      ['1', '3'],
    );
    assert.equal(snapshot.filters.groupBy, 'client');
    snapshot.filters.projects.push('Other');
    assert.deepEqual(store.filters().projects, ['Mobile']);
  } finally {
    injector.destroy();
  }
});

test('export rows preserve selected grouping, detail view, totals and filter metadata', () => {
  const snapshot: ReportSnapshot = {
    entries: entries.slice(0, 3),
    financial: true,
    filters: { ...DEFAULT_FILTERS, people: ['Alex', 'Sam'], groupBy: 'client' },
  };
  const rows = exportRows(snapshot);
  assert.deepEqual(
    rows.find((row) => row[0] === 'People'),
    ['People', 'Alex, Sam'],
  );
  assert.deepEqual(
    rows
      .filter((row) => row[0] === 'Subtotal')
      .map((row) => [row[1], row[9], row[10]]),
    [
      ['Acme', 4.5, 652.5],
      ['Northstar', 2, 0],
    ],
  );
  assert.deepEqual(rows.at(-1)?.slice(9), [6.5, 652.5]);
  const detailed = exportRows({
    ...snapshot,
    filters: { ...snapshot.filters, view: 'detailed' },
  });
  assert.equal(detailed.filter((row) => row[0] === 'Subtotal').length, 0);
  assert.equal(detailed.filter((row) => row[0] === 'Entry').length, 3);
  const restricted = exportRows({ ...snapshot, financial: false });
  assert.ok(!JSON.stringify(restricted).includes('652.5'));
  assert.ok(!restricted.flat().includes('Amount (USD)'));
  assert.equal(restricted.find((row) => row[0] === 'Type')?.length, 10);
});

test('CSV quotes delimiters and neutralizes formula prefixes in values and metadata', () => {
  for (const value of [
    '=SUM(1,2)',
    '+cmd',
    '-cmd',
    '@cmd',
    ' \t=cmd',
    '\tplain',
    '\rplain',
  ]) {
    assert.equal(spreadsheetText(value), `'${value}`);
  }
  assert.equal(spreadsheetText('Regular text'), 'Regular text');
  assert.equal(
    csvContent([['a,"quoted"\nline', '=1+1', 1.5]]),
    '\uFEFF"a,""quoted""\nline","\'=1+1","1.5"',
  );
});

test('CSV, XLSX and PDF produce real files without restricted financial values', async () => {
  const snapshot: ReportSnapshot = {
    entries: [entries[0]!],
    financial: false,
    filters: { ...DEFAULT_FILTERS, clients: ['=UNTRUSTED()'] },
  };
  const csv = await createExport(snapshot, 'csv');
  assert.match(await csv.text(), /'=UNTRUSTED\(\)/);
  assert.doesNotMatch(await csv.text(), /217\.5|Amount \(USD\)/);
  const xlsx = await createExport(snapshot, 'xlsx');
  const files = unzipSync(new Uint8Array(await xlsx.arrayBuffer()));
  const xml = Object.entries(files)
    .filter(([path]) => path.endsWith('.xml'))
    .map(([, content]) => strFromU8(content))
    .join('\n');
  assert.match(xml, /Discovery/);
  assert.match(xml, /UNTRUSTED/);
  assert.doesNotMatch(xml, /<f[ >]|217\.5|Amount \(USD\)/);
  const pdf = await createExport(snapshot, 'pdf');
  const text = await pdf.text();
  assert.ok(text.startsWith('%PDF-'));
  assert.match(text, /Discovery/);
  assert.doesNotMatch(text, /217\.5|Amount \(USD\)/);
});

test('empty exports retain filter context and long PDF reports retain the final row across pages', async () => {
  const filters = { ...DEFAULT_FILTERS, view: 'detailed' as const };
  const empty = exportRows({ filters, entries: [], financial: false });
  assert.deepEqual(empty.at(-1)?.slice(9), [0]);
  assert.equal(empty.filter((row) => row[0] === 'Entry').length, 0);
  const repeated = Array.from({ length: 100 }, (_, index) => ({
    ...entries[0]!,
    id: String(index),
    description: `Work item ${index}`,
  }));
  const pdf = await createExport(
    { filters, entries: repeated, financial: true },
    'pdf',
  );
  const text = await pdf.text();
  assert.match(text, /Work item 99/);
  assert.ok((text.match(/\/Type \/Page\b/g) ?? []).length > 1);
});
