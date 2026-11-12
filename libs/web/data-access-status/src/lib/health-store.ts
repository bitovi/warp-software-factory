import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import {
  removeAllEntities,
  setAllEntities,
  withEntities,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { type WorkspaceHealth } from '@wsf/shared/schemas';
import { ApiRequestError } from '@wsf/web/core';
import { catchError, EMPTY, exhaustMap, finalize, pipe, tap } from 'rxjs';
import { HealthClient } from './health-client';

type HealthEntity = WorkspaceHealth & { id: 'api' };

export const HealthStore = signalStore(
  withState({ loading: false, error: null as string | null }),
  withEntities<HealthEntity>(),
  withMethods((store, client = inject(HealthClient)) => ({
    load: rxMethod<void>(
      pipe(
        exhaustMap(() => {
          patchState(
            store,
            { loading: true, error: null },
            removeAllEntities(),
          );
          return client.getHealth().pipe(
            tap((health) =>
              patchState(store, setAllEntities([{ id: 'api', ...health }])),
            ),
            catchError((error: unknown) => {
              patchState(store, {
                error:
                  error instanceof ApiRequestError
                    ? error.message
                    : 'The API returned an invalid health response. Try again.',
              });
              return EMPTY;
            }),
            finalize(() => patchState(store, { loading: false })),
          );
        }),
      ),
    ),
  })),
);
