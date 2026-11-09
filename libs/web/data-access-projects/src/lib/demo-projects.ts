import { signal } from '@angular/core';
import {
  canManage,
  NamedOption,
  Person,
  Project,
  ProjectInput,
  ProjectsRepository,
  ProjectStatus,
  validateProjectInput,
  Viewer,
} from './projects';

export const DEMO_PEOPLE: readonly Person[] = [
  {
    id: 'emily',
    name: 'Emily Carter',
    title: 'Project manager',
    initials: 'EC',
  },
  { id: 'mia', name: 'Mia Chen', title: 'Product designer', initials: 'MC' },
  {
    id: 'jordan',
    name: 'Jordan Lee',
    title: 'Software engineer',
    initials: 'JL',
  },
  { id: 'alex', name: 'Alex Morgan', title: 'QA engineer', initials: 'AM' },
];
const CLIENTS: readonly NamedOption[] = [
  { id: 'acme', name: 'Acme Studio' },
  { id: 'orbit', name: 'Orbit Labs' },
  { id: 'northstar', name: 'Northstar' },
];
const SERVICES: readonly NamedOption[] = [
  { id: 'design', name: 'Product design' },
  { id: 'engineering', name: 'Engineering' },
  { id: 'management', name: 'Project management' },
  { id: 'qa', name: 'Quality assurance' },
];

export function createDemoProjects(now = new Date()): readonly Project[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const base: Project = {
    id: 'website',
    name: 'Website redesign',
    code: 'ACM-001',
    clientId: 'acme',
    startDate: '2026-01-01',
    endDate: '2027-03-31',
    color: '#0d9488',
    billable: true,
    rate: 125,
    budget: 160,
    status: 'active',
    archived: false,
    memberIds: ['emily', 'mia', 'jordan'],
    serviceIds: ['design', 'engineering', 'management'],
    entries: [
      {
        id: 't1',
        memberId: 'mia',
        serviceId: 'design',
        date: today,
        hours: 6,
        note: 'Design system exploration',
      },
      {
        id: 't2',
        memberId: 'jordan',
        serviceId: 'engineering',
        date: today,
        hours: 4.5,
        note: 'Component development',
      },
      {
        id: 't3',
        memberId: 'emily',
        serviceId: 'management',
        date: '2026-01-05',
        hours: 52,
        note: 'Discovery and delivery planning',
      },
    ],
  };
  return [
    base,
    {
      ...base,
      id: 'mobile',
      name: 'Mobile experience',
      code: 'ORB-002',
      clientId: 'orbit',
      color: '#7c3aed',
      budget: 80,
      memberIds: ['jordan', 'alex'],
      serviceIds: ['engineering', 'qa'],
      entries: [
        {
          id: 't4',
          memberId: 'jordan',
          serviceId: 'engineering',
          date: today,
          hours: 68,
          note: 'App development and testing',
        },
      ],
    },
    {
      ...base,
      id: 'brand',
      name: 'Brand evolution',
      code: 'NTH-003',
      clientId: 'northstar',
      color: '#d97706',
      status: 'on-hold',
      budget: 60,
      memberIds: ['emily', 'mia'],
      serviceIds: ['design'],
      entries: [],
    },
    {
      ...base,
      id: 'internal',
      name: 'Internal operations',
      code: 'INT-004',
      clientId: '',
      color: '#2563eb',
      billable: false,
      rate: 0,
      budget: null,
      memberIds: ['emily', 'alex'],
      serviceIds: ['management'],
      entries: [],
    },
    {
      ...base,
      id: 'launch',
      name: 'Launch campaign',
      code: 'ACM-005',
      color: '#db2777',
      status: 'completed',
      budget: 100,
      memberIds: ['mia'],
      serviceIds: ['design'],
      entries: [],
    },
  ];
}

export class DemoProjectsRepository implements ProjectsRepository {
  private readonly state = signal<readonly Project[]>(createDemoProjects());
  readonly projects = this.state.asReadonly();
  readonly people = DEMO_PEOPLE;
  readonly clients = CLIENTS;
  readonly services = SERVICES;

  save(viewer: Viewer, input: ProjectInput, id?: string): Project {
    this.requireManager(viewer);
    const existing = id ? this.mutableProject(viewer, id) : undefined;
    const value = validateProjectInput(
      input,
      this.projects(),
      this.clients,
      id,
    );
    const project: Project = existing
      ? { ...existing, ...value }
      : {
          ...value,
          id: crypto.randomUUID(),
          status: 'active',
          archived: false,
          memberIds: [viewer.id],
          serviceIds: [],
          entries: [],
        };
    this.state.update((projects) =>
      existing
        ? projects.map((item) => (item.id === id ? project : item))
        : [...projects, project],
    );
    return project;
  }

  assign(
    viewer: Viewer,
    id: string,
    kind: 'memberIds' | 'serviceIds',
    ids: readonly string[],
  ): void {
    const project = this.mutableProject(viewer, id);
    const options = kind === 'memberIds' ? this.people : this.services;
    if (ids.some((value) => !options.some((option) => option.id === value)))
      throw new Error('Choose available assignments.');
    this.replace({ ...project, [kind]: [...new Set(ids)] });
  }

  setStatus(viewer: Viewer, id: string, status: ProjectStatus): void {
    const project = this.mutableProject(viewer, id);
    if (!['active', 'on-hold', 'completed'].includes(status))
      throw new Error('Choose an available status.');
    this.replace({ ...project, status });
  }

  archive(viewer: Viewer, id: string, archived: boolean): void {
    this.requireManager(viewer);
    const project = this.find(id);
    this.replace({ ...project, archived });
  }

  delete(viewer: Viewer, id: string): void {
    this.requireManager(viewer);
    const project = this.find(id);
    if (!project.archived)
      throw new Error('Archive this project before deleting it.');
    this.state.update((projects) => projects.filter((item) => item.id !== id));
  }

  private mutableProject(viewer: Viewer, id: string): Project {
    this.requireManager(viewer);
    const project = this.find(id);
    if (project.archived)
      throw new Error('Restore this project before editing it.');
    return project;
  }

  private requireManager(viewer: Viewer): void {
    if (!canManage(viewer))
      throw new Error('Only managers can change projects in this demo.');
  }

  private find(id: string): Project {
    const project = this.projects().find((item) => item.id === id);
    if (!project) throw new Error('Project not found.');
    return project;
  }

  private replace(project: Project): void {
    this.state.update((projects) =>
      projects.map((item) => (item.id === project.id ? project : item)),
    );
  }
}
