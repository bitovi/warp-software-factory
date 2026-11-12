import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  CreateTaskSchema,
  TaskQuerySchema,
  UpdateTaskSchema,
  ValidationErrorResponseSchema,
  type TaskListResponse,
  type TaskQuery,
  type TaskResponse,
} from '@wsf/shared/schemas';
import { TasksClient } from '@wsf/web/data-access-tasks';
import { ApiRequestError } from '@wsf/web/core';
import { HlmButton } from '@wsf/web/ui';
import { finalize, switchMap, tap } from 'rxjs';
import { z } from 'zod';

@Component({
  selector: 'wsf-tasks-page',
  imports: [FormsModule, HlmButton],
  templateUrl: './tasks-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TasksPage {
  private readonly client = inject(TasksClient);
  private readonly destroyRef = inject(DestroyRef);
  protected title = '';
  protected search = '';
  protected sort: TaskQuery['sort'] = 'asc';
  private readonly query = signal(TaskQuerySchema.parse({}));
  protected readonly result = signal<TaskListResponse>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  protected readonly busy = signal(false);
  protected readonly fieldErrors = signal<Record<string, string[]>>({});
  protected readonly message = signal('');

  constructor() {
    this.load();
  }

  protected create(): void {
    if (this.busy()) return;
    const parsed = CreateTaskSchema.safeParse({ title: this.title });
    this.fieldErrors.set({});
    this.message.set('');
    if (!parsed.success) {
      this.fieldErrors.set(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    this.busy.set(true);
    this.client
      .create(parsed.data)
      .pipe(
        tap(() => {
          this.title = '';
          this.search = '';
          this.query.set(TaskQuerySchema.parse({ sort: this.sort }));
        }),
        switchMap(() => this.client.list(this.query())),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.result.set(response);
          this.message.set('Task created.');
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  protected toggle(task: TaskResponse): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.fieldErrors.set({});
    this.message.set('');
    this.client
      .update(task.id, UpdateTaskSchema.parse({ completed: !task.completed }))
      .pipe(
        switchMap(() => this.client.list(this.query())),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.result.set(response);
          this.message.set('Task updated.');
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  protected load(page = 1): void {
    if (this.busy()) return;
    this.fieldErrors.set({});
    this.message.set('');
    const parsed = TaskQuerySchema.safeParse({
      page,
      search: this.search,
      sort: this.sort,
    });
    if (!parsed.success) {
      this.fieldErrors.set(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    this.busy.set(true);
    this.client
      .list(parsed.data)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.query.set(parsed.data);
          this.result.set(response);
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  private showError(error: unknown): void {
    const response = error instanceof ApiRequestError ? error.response : error;
    if (response instanceof HttpErrorResponse && response.status === 400) {
      const parsed = ValidationErrorResponseSchema.safeParse(response.error);
      if (parsed.success) {
        this.fieldErrors.set(parsed.data.fieldErrors);
        this.message.set(
          parsed.data.formErrors.join(' ') || 'Check the highlighted fields.',
        );
        return;
      }
    }
    this.message.set('Could not load or save tasks. Check the API and retry.');
  }
}
