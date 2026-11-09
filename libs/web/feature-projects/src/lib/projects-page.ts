import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  canManage,
  DemoProjectsRepository,
  eligibleProjects,
  filterProjects,
  PROJECTS_REPOSITORY,
  Project,
  ProjectInput,
  projectMetrics,
  ProjectStatus,
  Viewer,
  visibleProjects,
} from '@wsf/web/data-access-projects';
import { StatusPage } from '@wsf/web/feature-status';
import { HlmButton } from '@wsf/web/ui';
import { ProjectForm } from './project-form';

@Component({
  selector: 'wsf-projects-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    HlmButton,
    ProjectForm,
    StatusPage,
  ],
  providers: [
    {
      provide: PROJECTS_REPOSITORY,
      useFactory: () => new DemoProjectsRepository(),
    },
  ],
  templateUrl: './projects-page.html',
  styleUrl: './projects-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsPage {
  protected readonly repository = inject(PROJECTS_REPOSITORY);
  protected readonly viewer = signal<Viewer>({ id: 'emily', role: 'manager' });
  protected readonly manager = computed(() => canManage(this.viewer()));
  protected readonly route = signal(location.hash.slice(1) || '/projects');
  protected readonly tab = signal('Overview');
  protected readonly tabs = ['Overview', 'Members', 'Services', 'Time entries'];
  protected readonly filters = signal({
    search: '',
    clientId: '',
    status: 'current',
    mine: false,
  });
  protected readonly scoped = computed(() =>
    visibleProjects(this.repository.projects(), this.viewer()),
  );
  protected readonly projects = computed(() =>
    filterProjects(this.repository.projects(), this.viewer(), this.filters()),
  );
  protected readonly selected = computed(() =>
    this.scoped().find((project) => this.route() === `/projects/${project.id}`),
  );
  protected readonly eligible = computed(() =>
    eligibleProjects(this.repository.projects(), this.viewer()),
  );
  protected readonly pickerId = signal('');
  protected readonly pickerProject = computed(() =>
    this.eligible().find((project) => project.id === this.pickerId()),
  );
  protected readonly activeCount = computed(
    () =>
      this.scoped().filter(
        (project) => !project.archived && project.status === 'active',
      ).length,
  );
  protected readonly weekHours = computed(() =>
    this.scoped().reduce(
      (sum, project) => sum + projectMetrics(project).week,
      0,
    ),
  );
  protected readonly budgetCount = computed(
    () =>
      this.scoped().filter(
        (project) =>
          !project.archived && (projectMetrics(project).percent ?? 0) >= 80,
      ).length,
  );
  protected readonly showForm = signal(false);
  protected readonly editing = signal<Project | null>(null);
  protected readonly formError = signal('');
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly metrics = projectMetrics;
  protected readonly clamp = (value: number) =>
    Math.min(100, Math.max(0, value));

  @HostListener('window:hashchange')
  protected routeChanged(): void {
    this.route.set(location.hash.slice(1) || '/projects');
    this.tab.set('Overview');
  }

  protected changeViewer(id: string): void {
    this.viewer.set({ id, role: id === 'emily' ? 'manager' : 'employee' });
    this.filters.set({
      search: '',
      clientId: '',
      status: 'current',
      mine: false,
    });
    this.showForm.set(false);
    this.pickerId.set('');
    this.notice.set('');
    this.error.set('');
    this.tab.set('Overview');
  }

  protected updateFilter(
    key: 'search' | 'clientId' | 'status',
    value: string,
  ): void {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
  }

  protected clearFilters(): void {
    this.filters.set({
      search: '',
      clientId: '',
      status: 'current',
      mine: false,
    });
  }

  protected toggleMine(checked: boolean): void {
    this.filters.update((filters) => ({ ...filters, mine: checked }));
  }

  protected openForm(project: Project | null = null): void {
    if (!this.manager() || project?.archived) return;
    this.editing.set(project);
    this.formError.set('');
    this.showForm.set(true);
  }

  protected saveProject(input: ProjectInput): void {
    try {
      const project = this.repository.save(
        this.viewer(),
        input,
        this.editing()?.id,
      );
      this.showForm.set(false);
      location.hash = `/projects/${project.id}`;
      this.notice.set(
        this.editing()
          ? 'Project updated.'
          : 'Project created. Add members and services below.',
      );
      this.error.set('');
    } catch (error) {
      this.formError.set(
        error instanceof Error ? error.message : 'Could not save the project.',
      );
    }
  }

  protected assign(
    project: Project,
    kind: 'memberIds' | 'serviceIds',
    id: string,
    checked: boolean,
  ): void {
    const ids = checked
      ? [...project[kind], id]
      : project[kind].filter((value) => value !== id);
    this.run(
      () => this.repository.assign(this.viewer(), project.id, kind, ids),
      'Assignments updated for this session.',
    );
  }

  protected changeStatus(project: Project, status: string): void {
    this.run(
      () =>
        this.repository.setStatus(
          this.viewer(),
          project.id,
          status as ProjectStatus,
        ),
      'Project status updated.',
    );
  }

  protected archive(project: Project): void {
    this.run(
      () =>
        this.repository.archive(this.viewer(), project.id, !project.archived),
      project.archived
        ? 'Project restored.'
        : 'Project archived. It is no longer available in the timesheet picker.',
    );
  }

  protected deleteProject(project: Project): void {
    if (
      !confirm(
        `Permanently delete “${project.name}” and its demo time entries? This cannot be undone in this session.`,
      )
    )
      return;
    this.run(() => {
      this.repository.delete(this.viewer(), project.id);
      location.hash = '/projects';
    }, 'Project deleted.');
  }

  protected clientName(id: string): string {
    return (
      this.repository.clients.find((client) => client.id === id)?.name ??
      'Internal'
    );
  }

  protected personName(id: string): string {
    return (
      this.repository.people.find((person) => person.id === id)?.name ??
      'Former member'
    );
  }

  protected serviceName(id: string): string {
    return (
      this.repository.services.find((service) => service.id === id)?.name ??
      'Former service'
    );
  }

  protected statusName(project: Project): string {
    return project.archived
      ? 'Archived'
      : { active: 'Active', 'on-hold': 'On hold', completed: 'Completed' }[
          project.status
        ];
  }

  private run(action: () => void, message: string): void {
    try {
      action();
      this.notice.set(message);
      this.error.set('');
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Could not update the project.',
      );
    }
  }
}
