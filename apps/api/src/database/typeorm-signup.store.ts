import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { NewOwner, SignupStore } from '@wsf/api/feature-auth';
import { SignupResponseSchema, type SignupResponse } from '@wsf/shared/schemas';
import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { Company } from './entities/company.entity';
import { EmailVerificationRequest } from './entities/email-verification-request.entity';
import { Membership } from './entities/membership.entity';
import { User } from './entities/user.entity';

@Injectable()
export class TypeOrmSignupStore extends SignupStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async createOwner(input: NewOwner): Promise<SignupResponse> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await manager.save(
          User,
          manager.create(User, {
            email: input.email,
            passwordHash: input.passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            emailVerifiedAt: null,
            status: 'active',
          }),
        );
        const slugPrefix =
          input.companyName
            .normalize('NFKD')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60)
            .replace(/-$/, '') || 'company';
        const company = await manager.save(
          Company,
          manager.create(Company, {
            name: input.companyName,
            slug: `${slugPrefix}-${randomUUID()}`,
          }),
        );
        const membership = await manager.save(
          Membership,
          manager.create(Membership, {
            userId: user.id,
            companyId: company.id,
            isOwner: true,
            status: 'active',
          }),
        );
        await manager.insert(EmailVerificationRequest, { userId: user.id });

        return SignupResponseSchema.parse({
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            emailVerifiedAt: user.emailVerifiedAt,
            status: user.status,
          },
          company: {
            id: company.id,
            name: company.name,
            slug: company.slug,
          },
          membership: {
            id: membership.id,
            userId: membership.userId,
            companyId: membership.companyId,
            isOwner: membership.isOwner,
            status: membership.status,
          },
        });
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driverError = error.driverError as {
          code?: string;
          constraint?: string;
        };
        if (
          driverError.code === '23505' &&
          driverError.constraint === 'users_email_key'
        ) {
          throw new ConflictException(
            'An account with this email already exists.',
          );
        }
      }
      throw error;
    }
  }
}
