import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSessions1794500000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app.users ADD COLUMN "lastMembershipId" uuid;
      CREATE TABLE app.auth_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "membershipId" uuid NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        CONSTRAINT auth_sessions_membership_fk FOREIGN KEY ("membershipId")
          REFERENCES app.memberships(id) ON DELETE CASCADE
      );
      CREATE TABLE app.refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "sessionId" uuid NOT NULL,
        "tokenHash" varchar(64) NOT NULL,
        "consumedAt" timestamptz,
        CONSTRAINT refresh_tokens_session_fk FOREIGN KEY ("sessionId")
          REFERENCES app.auth_sessions(id) ON DELETE CASCADE,
        CONSTRAINT refresh_tokens_hash_key UNIQUE ("tokenHash")
      );
      CREATE INDEX refresh_tokens_session_idx ON app.refresh_tokens ("sessionId");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE app.refresh_tokens;
      DROP TABLE app.auth_sessions;
      ALTER TABLE app.users DROP COLUMN "lastMembershipId";
    `);
  }
}
