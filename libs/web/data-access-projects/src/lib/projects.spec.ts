import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoProjects, DemoProjectsRepository } from './demo-projects';
import {
  eligibleProjects,
  filterProjects,
  Project,
  ProjectFilters,
  ProjectInput,
  projectMetrics,
  Viewer,
  visibleProjects,
} from './projects';

const manager: Viewer = { id: 'emily', role: 'manager' };
const employee: Viewer = { id: 'mia', role: 'employee' };
const input: ProjectInput = {
  name: '  Customer portal  ',
  code: ' new-006 ',
  clientId: '',
  startDate: '',
  endDate: '',
  color: '#0d9488',
  billable: false,
  rate: 0,
  budget: null,
};
const filters: ProjectFilters = {
  search: '',
  clientId: '',
  status: 'current',
  mine: false,
};
const ids = (projects: readonly Project[]) =>
  projects.map((project) => project.id);

test('creates normalized projects, edits without losing history, and keeps demo instances isolated', () => {
  const repository = new DemoProjectsRepository();
  const original = repository.projects();
  const project = repository.save(manager, input);
  assert.equal(project.name, 'Customer portal');
  assert.equal(project.code, 'NEW-006');
  assert.deepEqual(project.memberIds, ['emily']);
  assert.deepEqual(project.serviceIds, []);
  assert.equal(project.status, 'active');
  assert.equal(project.archived, false);
  assert.equal(original.length, 5);
  assert.equal(repository.projects().length, 6);
  assert.equal(new DemoProjectsRepository().projects().length, 5);
  const website = repository.projects().find((item) => item.id === 'website')!;
  const edited = repository.save(
    manager,
    { ...website, name: 'Updated website' },
    website.id,
  );
  assert.equal(edited.name, 'Updated website');
  assert.deepEqual(edited.entries, website.entries);
  assert.deepEqual(edited.memberIds, website.memberIds);
  assert.equal(repository.projects().length, 6);
});

test('rejects every employee mutation without changing state', () => {
  const repository = new DemoProjectsRepository();
  const before = repository.projects();
  const attempts = [
    () => repository.save(employee, input),
    () => repository.save(employee, input, 'website'),
    () => repository.assign(employee, 'website', 'memberIds', ['mia']),
    () => repository.assign(employee, 'website', 'serviceIds', ['design']),
    () => repository.setStatus(employee, 'website', 'completed'),
    () => repository.archive(employee, 'website', true),
    () => repository.delete(employee, 'website'),
  ];
  for (const attempt of attempts) assert.throws(attempt, /Only managers/);
  assert.equal(repository.projects(), before);
});

test('employees only see assigned projects, including in filtered queries', () => {
  const repository = new DemoProjectsRepository();
  assert.deepEqual(ids(visibleProjects(repository.projects(), employee)), [
    'website',
    'brand',
    'launch',
  ]);
  assert.equal(visibleProjects(repository.projects(), manager).length, 5);
  assert.deepEqual(
    visibleProjects(repository.projects(), { id: 'unknown', role: 'employee' }),
    [],
  );
  assert.deepEqual(
    filterProjects(repository.projects(), employee, {
      ...filters,
      search: 'ORB',
      status: 'all',
    }),
    [],
  );
  repository.assign(manager, 'website', 'memberIds', ['emily']);
  assert.ok(
    !ids(visibleProjects(repository.projects(), employee)).includes('website'),
  );
});

test('combines client, status, search and my-project filters without mutating source data', () => {
  const repository = new DemoProjectsRepository();
  assert.deepEqual(
    ids(
      filterProjects(repository.projects(), manager, {
        ...filters,
        search: '  aCm ',
        clientId: 'acme',
        status: 'active',
        mine: true,
      }),
    ),
    ['website'],
  );
  assert.deepEqual(
    ids(
      filterProjects(repository.projects(), manager, {
        ...filters,
        mine: true,
      }),
    ),
    ['website', 'brand', 'internal'],
  );
  assert.deepEqual(
    ids(
      filterProjects(repository.projects(), manager, {
        ...filters,
        status: 'on-hold',
      }),
    ),
    ['brand'],
  );
  repository.archive(manager, 'website', true);
  assert.deepEqual(
    ids(
      filterProjects(repository.projects(), manager, {
        ...filters,
        status: 'archived',
      }),
    ),
    ['website'],
  );
  assert.equal(
    filterProjects(repository.projects(), manager, {
      ...filters,
      status: 'all',
    }).length,
    5,
  );
  assert.equal(
    filterProjects(repository.projects(), manager, filters).length,
    4,
  );
});

test('timesheet eligibility tracks assignment, status, archive and restore for the current identity', () => {
  const repository = new DemoProjectsRepository();
  const project = repository.save(manager, input);
  assert.ok(
    ids(eligibleProjects(repository.projects(), manager)).includes(project.id),
  );
  assert.ok(
    !ids(eligibleProjects(repository.projects(), employee)).includes(
      project.id,
    ),
  );
  repository.assign(manager, project.id, 'memberIds', ['emily', 'mia', 'mia']);
  repository.assign(manager, project.id, 'serviceIds', [
    'design',
    'engineering',
  ]);
  assert.ok(
    ids(eligibleProjects(repository.projects(), employee)).includes(project.id),
  );
  assert.deepEqual(
    repository.projects().find((item) => item.id === project.id)?.memberIds,
    ['emily', 'mia'],
  );
  for (const status of ['on-hold', 'completed'] as const) {
    repository.setStatus(manager, project.id, status);
    assert.ok(
      !ids(eligibleProjects(repository.projects(), employee)).includes(
        project.id,
      ),
    );
  }
  repository.setStatus(manager, project.id, 'active');
  repository.archive(manager, project.id, true);
  assert.ok(
    !ids(eligibleProjects(repository.projects(), employee)).includes(
      project.id,
    ),
  );
  repository.archive(manager, project.id, false);
  assert.ok(
    ids(eligibleProjects(repository.projects(), employee)).includes(project.id),
  );
  repository.assign(manager, project.id, 'memberIds', []);
  assert.ok(
    !ids(eligibleProjects(repository.projects(), manager)).includes(project.id),
  );
});

test('archive preserves history, blocks edits and assignments, and allows deliberate deletion', () => {
  const repository = new DemoProjectsRepository();
  const website = repository.projects().find((item) => item.id === 'website')!;
  assert.throws(() => repository.delete(manager, website.id), /Archive/);
  repository.archive(manager, website.id, true);
  assert.throws(() => repository.save(manager, website, website.id), /Restore/);
  assert.throws(
    () => repository.assign(manager, website.id, 'memberIds', []),
    /Restore/,
  );
  assert.throws(
    () => repository.setStatus(manager, website.id, 'completed'),
    /Restore/,
  );
  assert.deepEqual(
    repository.projects().find((item) => item.id === website.id)?.entries,
    website.entries,
  );
  repository.archive(manager, website.id, false);
  assert.equal(
    repository.projects().find((item) => item.id === website.id)?.status,
    'active',
  );
  repository.archive(manager, website.id, true);
  repository.delete(manager, website.id);
  assert.ok(!ids(repository.projects()).includes(website.id));
  assert.throws(
    () => repository.archive(manager, website.id, false),
    /not found/,
  );
});

test('rejects invalid inputs and duplicate codes atomically, while allowing an unchanged edit code', () => {
  const repository = new DemoProjectsRepository();
  const invalid: Partial<ProjectInput>[] = [
    { name: '  ' },
    { name: 'x'.repeat(101) },
    { code: 'a' },
    { code: 'bad code' },
    { code: 'acm-001' },
    { clientId: 'missing' },
    { startDate: '2026-02-30' },
    { endDate: 'not-a-date' },
    { startDate: '2026-03-02', endDate: '2026-03-01' },
    { rate: -1 },
    { rate: NaN },
    { rate: Infinity },
    { rate: 1_000_001 },
    { budget: 0 },
    { budget: -1 },
    { budget: NaN },
    { budget: 1_000_001 },
    { color: 'red' },
  ];
  const before = repository.projects();
  for (const patch of invalid) {
    assert.throws(() => repository.save(manager, { ...input, ...patch }));
    assert.equal(repository.projects(), before);
  }
  const website = before.find((item) => item.id === 'website')!;
  assert.doesNotThrow(() => repository.save(manager, website, website.id));
  assert.throws(() => repository.save(manager, input, 'missing'), /not found/);
  assert.throws(
    () => repository.assign(manager, website.id, 'memberIds', ['missing']),
    /available/,
  );
  assert.throws(
    () => repository.assign(manager, website.id, 'serviceIds', ['missing']),
    /available/,
  );
});

test('metrics use local calendar boundaries for current hours and all entries for budget totals', () => {
  const base = createDemoProjects()[0]!;
  const project: Project = {
    ...base,
    budget: 10,
    entries: [
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-04',
      '2026-11-05',
    ].map((date, index) => ({
      id: String(index),
      date,
      memberId: 'mia',
      serviceId: 'design',
      note: '',
      hours: 3,
    })),
  };
  assert.deepEqual(projectMetrics(project, new Date(2026, 10, 4, 13)), {
    hours: 15,
    week: 6,
    month: 9,
    percent: 150,
    remaining: -5,
  });
  assert.equal(projectMetrics(project, new Date(2026, 10, 1)).week, 6);
  assert.equal(projectMetrics({ ...project, budget: null }).percent, null);
  assert.equal(projectMetrics({ ...project, budget: null }).remaining, null);
  assert.deepEqual(projectMetrics({ ...project, entries: [] }), {
    hours: 0,
    week: 0,
    month: 0,
    percent: 0,
    remaining: 10,
  });
});
