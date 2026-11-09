import { InjectionToken, Signal } from '@angular/core';

export type ProjectStatus = 'active' | 'on-hold' | 'completed';
export interface Viewer {
  id: string;
  role: 'manager' | 'employee';
}
export interface Person {
  id: string;
  name: string;
  title: string;
  initials: string;
}
export interface NamedOption {
  id: string;
  name: string;
}
export interface TimeEntry {
  id: string;
  memberId: string;
  serviceId: string;
  date: string;
  hours: number;
  note: string;
}
export interface ProjectInput {
  name: string;
  code: string;
  clientId: string;
  startDate: string;
  endDate: string;
  color: string;
  billable: boolean;
  rate: number;
  budget: number | null;
}
export interface Project extends ProjectInput {
  id: string;
  status: ProjectStatus;
  archived: boolean;
  memberIds: readonly string[];
  serviceIds: readonly string[];
  entries: readonly TimeEntry[];
}
export interface ProjectFilters {
  search: string;
  clientId: string;
  status: string;
  mine: boolean;
}
export interface ProjectsRepository {
  readonly projects: Signal<readonly Project[]>;
  readonly people: readonly Person[];
  readonly clients: readonly NamedOption[];
  readonly services: readonly NamedOption[];
  save(viewer: Viewer, input: ProjectInput, id?: string): Project;
  assign(
    viewer: Viewer,
    id: string,
    kind: 'memberIds' | 'serviceIds',
    ids: readonly string[],
  ): void;
  setStatus(viewer: Viewer, id: string, status: ProjectStatus): void;
  archive(viewer: Viewer, id: string, archived: boolean): void;
  delete(viewer: Viewer, id: string): void;
}

export const PROJECTS_REPOSITORY = new InjectionToken<ProjectsRepository>(
  'ProjectsRepository',
);

export function canManage(viewer: Viewer): boolean {
  return viewer.role === 'manager';
}

export function visibleProjects(
  projects: readonly Project[],
  viewer: Viewer,
): readonly Project[] {
  return projects.filter(
    (project) => canManage(viewer) || project.memberIds.includes(viewer.id),
  );
}

export function filterProjects(
  projects: readonly Project[],
  viewer: Viewer,
  filters: ProjectFilters,
): readonly Project[] {
  const search = filters.search.trim().toLowerCase();
  return visibleProjects(projects, viewer).filter(
    (project) =>
      `${project.name} ${project.code}`.toLowerCase().includes(search) &&
      (!filters.clientId || project.clientId === filters.clientId) &&
      (filters.status === 'all' ||
        (filters.status === 'archived'
          ? project.archived
          : !project.archived &&
            (filters.status === 'current' ||
              project.status === filters.status))) &&
      (!filters.mine || project.memberIds.includes(viewer.id)),
  );
}

export function eligibleProjects(
  projects: readonly Project[],
  viewer: Viewer,
): readonly Project[] {
  return visibleProjects(projects, viewer).filter(
    (project) =>
      !project.archived &&
      project.status === 'active' &&
      project.memberIds.includes(viewer.id),
  );
}

export function projectMetrics(project: Project, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = new Date(day);
  week.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  const month = new Date(day.getFullYear(), day.getMonth(), 1);
  const sumSince = (start: Date) =>
    project.entries
      .filter((entry) => {
        const date = new Date(`${entry.date}T00:00:00`);
        return date >= start && date <= day;
      })
      .reduce((total, entry) => total + entry.hours, 0);
  const hours = project.entries.reduce(
    (total, entry) => total + entry.hours,
    0,
  );
  return {
    hours,
    week: sumSince(week),
    month: sumSince(month),
    percent: project.budget ? (hours / project.budget) * 100 : null,
    remaining: project.budget === null ? null : project.budget - hours,
  };
}

export function validateProjectInput(
  input: ProjectInput,
  projects: readonly Project[],
  clients: readonly NamedOption[],
  id?: string,
): ProjectInput {
  const value = {
    ...input,
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
  };
  if (!value.name || value.name.length > 100)
    throw new Error('Enter a project name of 1–100 characters.');
  if (!/^[A-Z0-9][A-Z0-9-]{1,11}$/.test(value.code))
    throw new Error(
      'Use 2–12 letters, numbers or hyphens for the project code.',
    );
  if (
    projects.some(
      (project) =>
        project.id !== id && project.code.toUpperCase() === value.code,
    )
  )
    throw new Error('This project code is already in use.');
  if (value.clientId && !clients.some((client) => client.id === value.clientId))
    throw new Error('Choose an available client.');
  const validDate = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  if (
    (value.startDate && !validDate(value.startDate)) ||
    (value.endDate && !validDate(value.endDate))
  )
    throw new Error('Enter valid project dates.');
  if (value.startDate && value.endDate && value.endDate < value.startDate)
    throw new Error('End date must be on or after the start date.');
  if (!/^#[0-9a-f]{6}$/i.test(value.color))
    throw new Error('Choose a valid project color.');
  if (!Number.isFinite(value.rate) || value.rate < 0 || value.rate > 1_000_000)
    throw new Error('Hourly rate must be between 0 and 1,000,000 USD.');
  if (
    value.budget !== null &&
    (!Number.isFinite(value.budget) ||
      value.budget <= 0 ||
      value.budget > 1_000_000)
  )
    throw new Error(
      'Budget must be greater than 0 and at most 1,000,000 hours.',
    );
  return value;
}
