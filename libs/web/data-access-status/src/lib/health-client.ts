import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  workspaceHealthSchema,
  type WorkspaceHealth,
} from '@wsf/shared/schemas';
import { map, type Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HealthClient {
  private readonly http = inject(HttpClient);

  getHealth(): Observable<WorkspaceHealth> {
    return this.http
      .get<unknown>('/api/health', { timeout: 10_000 })
      .pipe(map((response) => workspaceHealthSchema.parse(response)));
  }
}
