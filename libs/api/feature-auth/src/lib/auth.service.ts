import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { argon2id, hash, verify } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { AccessClaims, Login, TokenResponse } from '@wsf/shared/schemas';
import { AuthStore, type SessionIdentity } from './auth.store';

@Injectable()
export class AuthService {
  private readonly dummyHash = hash(randomBytes(32), {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  constructor(
    private readonly store: AuthStore,
    private readonly jwt: JwtService,
  ) {}

  async authenticate(input: Login): Promise<string> {
    const user = await this.store.credentials(input.email);
    const valid = await verify(
      user?.passwordHash ?? (await this.dummyHash),
      input.password,
    );
    if (!valid || !user || user.status !== 'active')
      throw new UnauthorizedException('Invalid email or password.');
    return user.id;
  }

  async login(userId: string) {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await this.store.createSession(
      userId,
      this.digest(refreshToken),
      new Date(Date.now() + 30 * 86400000),
    );
    if (!session) throw new UnauthorizedException('Invalid email or password.');
    return this.tokens(session, refreshToken);
  }

  async refresh(token: string | null) {
    if (!token) throw new UnauthorizedException();
    const replacement = randomBytes(32).toString('base64url');
    const session = await this.store.rotateSession(
      this.digest(token),
      this.digest(replacement),
    );
    if (!session) throw new UnauthorizedException();
    return this.tokens(session, replacement);
  }

  async logout(token: string | null): Promise<void> {
    if (token) await this.store.revokeSession(this.digest(token));
  }

  async me(claims: AccessClaims) {
    const result = await this.store.currentUser(claims);
    if (!result) throw new UnauthorizedException();
    return result;
  }

  private async tokens(session: SessionIdentity, refreshToken: string) {
    const { expiresAt, ...claims } = session;
    const body: TokenResponse = {
      accessToken: await this.jwt.signAsync(claims),
      tokenType: 'Bearer',
      expiresIn: 900,
    };
    return { body, refreshToken, expiresAt };
  }

  private digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
