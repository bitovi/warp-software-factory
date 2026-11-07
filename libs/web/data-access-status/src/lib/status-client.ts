import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  workspaceStatusSchema,
  type WorkspaceStatus,
} from '@wsf/shared/schemas';
import { map, type Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class StatusClient {
  private readonly http = inject(HttpClient);

  getStatus(): Observable<WorkspaceStatus> {
    return this.http
      .get<unknown>('/api/status')
      .pipe(map((response) => workspaceStatusSchema.parse(response)));
  }
}
