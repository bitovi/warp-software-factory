import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSignupTables1794500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE app.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        email varchar(254) NOT NULL,
        "passwordHash" text NOT NULL,
        "firstName" varchar(100) NOT NULL,
        "lastName" varchar(100) NOT NULL,
        "emailVerifiedAt" timestamptz,
        status varchar(16) NOT NULL DEFAULT 'active',
        CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email))),
        CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled'))
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX users_email_key ON app.users (email)',
    );
    await queryRunner.query(`
      CREATE TABLE app.companies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        name varchar(200) NOT NULL,
        slug varchar(100) NOT NULL
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX companies_slug_key ON app.companies (slug)',
    );
    await queryRunner.query(`
      CREATE TABLE app.memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "companyId" uuid NOT NULL,
        "isOwner" boolean NOT NULL DEFAULT false,
        status varchar(16) NOT NULL DEFAULT 'active',
        CONSTRAINT memberships_user_fk FOREIGN KEY ("userId")
          REFERENCES app.users (id) ON DELETE CASCADE,
        CONSTRAINT memberships_company_fk FOREIGN KEY ("companyId")
          REFERENCES app.companies (id) ON DELETE CASCADE,
        CONSTRAINT memberships_status_check CHECK (status IN ('active', 'invited', 'disabled'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX memberships_user_company_key
      ON app.memberships ("userId", "companyId")
    `);
    await queryRunner.query(`
      CREATE TABLE app.email_verification_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "processedAt" timestamptz,
        CONSTRAINT email_verification_requests_user_fk FOREIGN KEY ("userId")
          REFERENCES app.users (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX email_verification_requests_user_key
      ON app.email_verification_requests ("userId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE app.email_verification_requests');
    await queryRunner.query('DROP TABLE app.memberships');
    await queryRunner.query('DROP TABLE app.companies');
    await queryRunner.query('DROP TABLE app.users');
  }
}
