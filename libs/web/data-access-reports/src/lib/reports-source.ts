import { InjectionToken, Signal, signal } from '@angular/core';
import { Permission, TimeEntry } from './reports-model';

export interface ReportsSource {
  entries: Signal<readonly TimeEntry[]>;
  permissions: Signal<readonly Permission[]>;
}

const projects = [
  { project: 'Website redesign', client: 'Acme Studio', rate: 150 },
  { project: 'Mobile experience', client: 'Northstar', rate: 175 },
  { project: 'Brand strategy', client: 'Acme Studio', rate: 150 },
  { project: 'Internal operations', client: 'Internal', rate: 0 },
] as const;
const people = ['Alex Morgan', 'Jamie Chen', 'Sam Rivera', 'Taylor Brooks'];
const tasks = [
  'Design exploration and iteration',
  'Component development',
  'Research and discovery',
  'Planning and team collaboration',
];

export const DEMO_ENTRIES: readonly TimeEntry[] = Array.from(
  { length: 56 },
  (_, index) => {
    const project = projects[index % projects.length]!;
    const minutes = [90, 150, 210, 120, 180, 240, 60][index % 7]!;
    const billable = project.rate > 0 && index % 5 !== 0;
    return {
      id: `demo-${index + 1}`,
      date: new Date(Date.UTC(2026, 9, 26 + Math.floor(index / 4)))
        .toISOString()
        .slice(0, 10),
      project: project.project,
      client: project.client,
      person: people[(index + Math.floor(index / 4)) % people.length]!,
      description: tasks[(index + Math.floor(index / 4)) % tasks.length]!,
      minutes,
      billable,
      status:
        index % 9 === 0 ? 'draft' : index % 4 === 0 ? 'pending' : 'approved',
      amount: billable ? (minutes / 60) * project.rate : 0,
    };
  },
);

export const DEMO_PERMISSIONS = signal<readonly Permission[]>([
  'reports:view',
  'reports:financial',
]);

// Replace this provider with server-authorized data before using real workspace data.
export const REPORTS_SOURCE = new InjectionToken<ReportsSource>(
  'REPORTS_SOURCE',
  {
    providedIn: 'root',
    factory: () => ({
      entries: signal(DEMO_ENTRIES).asReadonly(),
      permissions: DEMO_PERMISSIONS.asReadonly(),
    }),
  },
);
