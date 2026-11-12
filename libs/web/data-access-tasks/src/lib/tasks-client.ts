import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  TaskListResponseSchema,
  TaskResponseSchema,
  type CreateTask,
  type TaskListResponse,
  type TaskQuery,
  type TaskResponse,
  type UpdateTask,
} from '@wsf/shared/schemas';
import { map, type Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TasksClient {
  private readonly http = inject(HttpClient);

  create(input: CreateTask): Observable<TaskResponse> {
    return this.http
      .post<unknown>('/api/tasks', input)
      .pipe(map((response) => TaskResponseSchema.parse(response)));
  }

  update(id: string, input: UpdateTask): Observable<TaskResponse> {
    return this.http
      .patch<unknown>(`/api/tasks/${encodeURIComponent(id)}`, input)
      .pipe(map((response) => TaskResponseSchema.parse(response)));
  }

  list(query: TaskQuery): Observable<TaskListResponse> {
    return this.http
      .get<unknown>('/api/tasks', { params: query })
      .pipe(map((response) => TaskListResponseSchema.parse(response)));
  }
}
