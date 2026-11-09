export type GroupBy = 'project' | 'client' | 'person' | 'date';
export type ReportView = 'summary' | 'detailed';
export type EntryStatus = 'approved' | 'pending' | 'draft';
export type Permission = 'reports:view' | 'reports:financial';

export interface TimeEntry {
  id: string;
  date: string;
  project: string;
  client: string;
  person: string;
  description: string;
  minutes: number;
  billable: boolean;
  status: EntryStatus;
  amount?: number;
}

export interface ReportFilters {
  from: string;
  to: string;
  projects: string[];
  clients: string[];
  people: string[];
  billable: 'all' | 'yes' | 'no';
  status: 'all' | EntryStatus;
  groupBy: GroupBy;
  view: ReportView;
  split: 'project' | 'client';
}

export const DEFAULT_FILTERS: ReportFilters = {
  from: '2026-11-02',
  to: '2026-11-08',
  projects: [],
  clients: [],
  people: [],
  billable: 'all',
  status: 'all',
  groupBy: 'project',
  view: 'summary',
  split: 'project',
};

export const DATE_PRESETS = [
  { label: 'This week', from: '2026-11-02', to: '2026-11-08' },
  { label: 'Last week', from: '2026-10-26', to: '2026-11-01' },
  { label: 'This month', from: '2026-11-01', to: '2026-11-30' },
] as const;

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function normalizeFilters(filters: ReportFilters): ReportFilters {
  const from = validDate(filters.from) ? filters.from : DEFAULT_FILTERS.from;
  const to = validDate(filters.to) ? filters.to : DEFAULT_FILTERS.to;
  const unique = (items: string[]) =>
    [...new Set(items.filter(Boolean))].sort();
  return {
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    projects: unique(filters.projects),
    clients: unique(filters.clients),
    people: unique(filters.people),
    billable: ['yes', 'no'].includes(filters.billable)
      ? filters.billable
      : 'all',
    status: ['approved', 'pending', 'draft'].includes(filters.status)
      ? filters.status
      : 'all',
    groupBy: ['project', 'client', 'person', 'date'].includes(filters.groupBy)
      ? filters.groupBy
      : 'project',
    view: filters.view === 'detailed' ? 'detailed' : 'summary',
    split: filters.split === 'client' ? 'client' : 'project',
  };
}

export function filtersFromUrl(params: URLSearchParams): ReportFilters {
  return normalizeFilters({
    ...DEFAULT_FILTERS,
    from: params.get('from') ?? DEFAULT_FILTERS.from,
    to: params.get('to') ?? DEFAULT_FILTERS.to,
    projects: params.getAll('project'),
    clients: params.getAll('client'),
    people: params.getAll('person'),
    billable: params.get('billable') as ReportFilters['billable'],
    status: params.get('status') as ReportFilters['status'],
    groupBy: params.get('group') as GroupBy,
    view: params.get('view') as ReportView,
    split: params.get('split') as ReportFilters['split'],
  });
}

export function filtersToUrl(
  filters: ReportFilters,
  existing = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(existing);
  for (const key of [
    'from',
    'to',
    'project',
    'client',
    'person',
    'billable',
    'status',
    'group',
    'view',
    'split',
  ])
    params.delete(key);
  const normalized = normalizeFilters(filters);
  params.set('from', normalized.from);
  params.set('to', normalized.to);
  for (const [key, values] of [
    ['project', normalized.projects],
    ['client', normalized.clients],
    ['person', normalized.people],
  ] as const) {
    for (const value of values) params.append(key, value);
  }
  params.set('billable', normalized.billable);
  params.set('status', normalized.status);
  params.set('group', normalized.groupBy);
  params.set('view', normalized.view);
  params.set('split', normalized.split);
  return params;
}

export function filterEntries(
  entries: readonly TimeEntry[],
  filters: ReportFilters,
): TimeEntry[] {
  return entries
    .filter(
      (entry) =>
        entry.date >= filters.from &&
        entry.date <= filters.to &&
        (!filters.projects.length ||
          filters.projects.includes(entry.project)) &&
        (!filters.clients.length || filters.clients.includes(entry.client)) &&
        (!filters.people.length || filters.people.includes(entry.person)) &&
        (filters.billable === 'all' ||
          entry.billable === (filters.billable === 'yes')) &&
        (filters.status === 'all' || entry.status === filters.status),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function summarize(entries: readonly TimeEntry[], financial: boolean) {
  const minutes = entries.reduce((total, entry) => total + entry.minutes, 0);
  const billableMinutes = entries.reduce(
    (total, entry) => total + (entry.billable ? entry.minutes : 0),
    0,
  );
  return {
    hours: minutes / 60,
    billableHours: billableMinutes / 60,
    billablePercent: minutes ? (billableMinutes / minutes) * 100 : 0,
    ...(financial
      ? {
          amount: entries.reduce(
            (total, entry) => total + (entry.amount ?? 0),
            0,
          ),
        }
      : {}),
  };
}

export function groupEntries(
  entries: readonly TimeEntry[],
  groupBy: GroupBy,
  financial: boolean,
) {
  const groups = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const key = entry[groupBy];
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, rows]) => ({
      name,
      entries: rows,
      summary: summarize(rows, financial),
    }));
}
