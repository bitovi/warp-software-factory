import type { AccessClaims, AuthMeResponse } from '@wsf/shared/schemas';

export interface Credentials {
  id: string;
  passwordHash: string;
  status: 'active' | 'disabled';
}

export interface SessionIdentity extends AccessClaims {
  expiresAt: Date;
}

export abstract class AuthStore {
  abstract credentials(email: string): Promise<Credentials | null>;
  abstract createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<SessionIdentity | null>;
  abstract rotateSession(
    tokenHash: string,
    replacementHash: string,
  ): Promise<SessionIdentity | null>;
  abstract revokeSession(tokenHash: string): Promise<void>;
  abstract currentUser(claims: AccessClaims): Promise<AuthMeResponse | null>;
}
