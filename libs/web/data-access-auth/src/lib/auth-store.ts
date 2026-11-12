import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import {
  type AuthMeResponse,
  type Login,
  type Signup,
} from '@wsf/shared/schemas';
import { AuthClient } from './auth-client';

type AuthStatus =
  | 'initializing'
  | 'anonymous'
  | 'authenticating'
  | 'authenticated'
  | 'logging-out';

export class AccountCreatedError extends Error {
  constructor(cause: unknown) {
    super('Account created. Sign in to continue.', { cause });
  }
}

const emptySession = {
  user: null as AuthMeResponse['user'] | null,
  activeCompany: null as AuthMeResponse['company'] | null,
  memberships: [] as AuthMeResponse['memberships'],
  accessToken: null as string | null,
};

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState({
    ...emptySession,
    status: 'initializing' as AuthStatus,
    sessionVersion: 0,
  }),
  withMethods((store, client = inject(AuthClient)) => {
    let queue = Promise.resolve();
    let refreshFlight: Promise<string> | null = null;
    let initialization: Promise<void> | null = null;

    function serialize<T>(operation: () => Promise<T>): Promise<T> {
      const result = queue.then(operation);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }

    function checkSession(version: number): void {
      if (version !== store.sessionVersion())
        throw new Error('Session changed.');
    }

    function reset(status: AuthStatus): number {
      const version = store.sessionVersion() + 1;
      patchState(store, { ...emptySession, status, sessionVersion: version });
      refreshFlight = null;
      return version;
    }

    function logout(): Promise<void> {
      const version = reset('logging-out');
      // Cookie responses must finish before logout clears the final rotated cookie.
      return serialize(async () => {
        try {
          await client.logout();
        } catch {
          // Local sign-out must not depend on the API being reachable.
        } finally {
          if (version === store.sessionVersion())
            patchState(store, { status: 'anonymous' });
        }
      });
    }

    function refresh(): Promise<string> {
      if (refreshFlight) return refreshFlight;
      if (
        ['anonymous', 'authenticating', 'logging-out'].includes(store.status())
      ) {
        return Promise.reject(new Error('No active session.'));
      }
      const version = store.sessionVersion();
      const pending = serialize(async () => {
        checkSession(version);
        const response = await client.refresh();
        checkSession(version);
        patchState(store, { accessToken: response.accessToken });
        return response.accessToken;
      });
      const flight = pending
        .catch(async (error: unknown) => {
          if (version === store.sessionVersion()) await logout();
          throw error;
        })
        .finally(() => {
          if (refreshFlight === flight) refreshFlight = null;
        });
      refreshFlight = flight;
      return flight;
    }

    async function loadMe(): Promise<void> {
      const version = store.sessionVersion();
      const response = await client.me();
      checkSession(version);
      patchState(store, {
        user: response.user,
        activeCompany: response.company,
        memberships: response.memberships,
        status: 'authenticated',
      });
    }

    function initialize(): Promise<void> {
      initialization ??= (async () => {
        const version = store.sessionVersion();
        try {
          await refresh();
          checkSession(version);
          await loadMe();
        } catch {
          if (version === store.sessionVersion()) await logout();
        }
      })();
      return initialization;
    }

    function authenticate(input: Login, signup?: Signup): Promise<void> {
      const version = reset('authenticating');
      let accountCreated = false;
      return serialize(async () => {
        checkSession(version);
        if (signup) {
          await client.signup(signup);
          accountCreated = true;
          checkSession(version);
        }
        const token = await client.login({
          email: input.email,
          password: input.password,
        });
        checkSession(version);
        patchState(store, { accessToken: token.accessToken });
        await loadMe();
        checkSession(version);
      }).catch(async (error: unknown) => {
        if (version === store.sessionVersion()) await logout();
        if (accountCreated) throw new AccountCreatedError(error);
        throw error;
      });
    }

    return {
      initialize,
      login: (input: Login) => authenticate(input),
      signup: (input: Signup) => authenticate(input, input),
      logout,
      refresh,
      loadMe,
    };
  }),
);
