import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AuthStore,
  type Credentials,
  type SessionIdentity,
} from '@wsf/api/feature-auth';
import {
  AuthMeResponseSchema,
  type AccessClaims,
  type AuthMeResponse,
} from '@wsf/shared/schemas';
import { DataSource, EntityManager, IsNull, MoreThan } from 'typeorm';
import { AuthSession } from './entities/auth-session.entity';
import { Membership } from './entities/membership.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';

@Injectable()
export class TypeOrmAuthStore extends AuthStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async credentials(email: string): Promise<Credentials | null> {
    return this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .select(['user.id', 'user.status'])
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<SessionIdentity | null> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId, status: 'active' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) return null;
      const memberships = await manager.find(Membership, {
        where: { userId, status: 'active' },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      const membership =
        memberships.find((item) => item.id === user.lastMembershipId) ??
        memberships[0];
      if (!membership) return null;
      const session = await manager.save(
        AuthSession,
        manager.create(AuthSession, {
          membershipId: membership.id,
          expiresAt,
        }),
      );
      await manager.insert(RefreshToken, { sessionId: session.id, tokenHash });
      await manager.update(User, userId, { lastMembershipId: membership.id });
      return this.identity(session, membership);
    });
  }

  async rotateSession(
    tokenHash: string,
    replacementHash: string,
  ): Promise<SessionIdentity | null> {
    return this.dataSource.transaction(async (manager) => {
      const token = await manager.findOneBy(RefreshToken, { tokenHash });
      if (!token) return null;
      const session = await manager.findOne(AuthSession, {
        where: { id: token.sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.revokedAt) return null;
      const current = await manager.findOneByOrFail(RefreshToken, {
        id: token.id,
      });
      if (current.consumedAt || session.expiresAt.getTime() <= Date.now()) {
        await manager.update(AuthSession, session.id, {
          revokedAt: new Date(),
        });
        // Return instead of throwing so the revocation commits.
        return null;
      }
      const membership = await this.activeMembership(
        manager,
        session.membershipId,
      );
      if (!membership) {
        await manager.update(AuthSession, session.id, {
          revokedAt: new Date(),
        });
        return null;
      }
      await manager.update(RefreshToken, token.id, { consumedAt: new Date() });
      await manager.insert(RefreshToken, {
        sessionId: session.id,
        tokenHash: replacementHash,
      });
      return this.identity(session, membership);
    });
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const token = await manager.findOneBy(RefreshToken, { tokenHash });
      if (!token) return;
      const session = await manager.findOne(AuthSession, {
        where: { id: token.sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (session && !session.revokedAt) {
        await manager.update(AuthSession, session.id, {
          revokedAt: new Date(),
        });
      }
    });
  }

  async currentUser(claims: AccessClaims): Promise<AuthMeResponse | null> {
    const session = await this.dataSource.manager.findOne(AuthSession, {
      where: {
        id: claims.sid,
        membershipId: claims.membershipId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!session) return null;
    const membership = await this.activeMembership(
      this.dataSource.manager,
      claims.membershipId,
    );
    if (
      !membership ||
      membership.userId !== claims.sub ||
      membership.companyId !== claims.companyId
    )
      return null;
    const memberships = await this.dataSource.manager.find(Membership, {
      where: { userId: claims.sub, status: 'active' },
      relations: { company: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const user = membership.user;
    return AuthMeResponseSchema.parse({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        status: user.status,
      },
      company: this.company(membership),
      memberships: memberships.map((item) => ({
        id: item.id,
        userId: item.userId,
        companyId: item.companyId,
        isOwner: item.isOwner,
        status: item.status,
        company: this.company(item),
      })),
    });
  }

  private activeMembership(
    manager: EntityManager,
    id: string,
  ): Promise<Membership | null> {
    return manager.findOne(Membership, {
      where: { id, status: 'active', user: { status: 'active' } },
      relations: { user: true, company: true },
    });
  }

  private identity(
    session: AuthSession,
    membership: Membership,
  ): SessionIdentity {
    return {
      sub: membership.userId,
      companyId: membership.companyId,
      membershipId: membership.id,
      sid: session.id,
      expiresAt: session.expiresAt,
    };
  }

  private company(membership: Membership) {
    return {
      id: membership.company.id,
      name: membership.company.name,
      slug: membership.company.slug,
    };
  }
}
