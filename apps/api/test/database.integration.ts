import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  SignupResponseSchema,
  ValidationErrorResponseSchema,
} from '@wsf/shared/schemas';
import { verify } from 'argon2';
import { config } from 'dotenv';
import request from 'supertest';
import { Column, DataSource, Entity } from 'typeorm';
import { ApiExpressAdapter } from '../src/common/api-express.adapter';
import { validateEnvironment } from '../src/config/environment';
import { databaseOptions } from '../src/database-options';
import { BaseEntity } from '../src/database/entities/base.entity';
import { Company } from '../src/database/entities/company.entity';
import { EmailVerificationRequest } from '../src/database/entities/email-verification-request.entity';
import { Membership } from '../src/database/entities/membership.entity';
import { User } from '../src/database/entities/user.entity';
import { AuthSession } from '../src/database/entities/auth-session.entity';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';

@Entity({ name: 'base_entity_probe', schema: 'app' })
class EntityProbe extends BaseEntity {
  @Column()
  value!: string;
}

describe('PostgreSQL API', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let ownsMigrations = false;
  const signup = {
    email: 'owner@example.com',
    password: '  a long passphrase  ',
    firstName: ' Ada ',
    lastName: ' Lovelace ',
    companyName: ' Analytical Engines ',
  };

  const counts = async () => ({
    users: await dataSource.getRepository(User).count(),
    companies: await dataSource.getRepository(Company).count(),
    memberships: await dataSource.getRepository(Membership).count(),
    requests: await dataSource.getRepository(EmailVerificationRequest).count(),
  });

  before(async () => {
    const loaded = config({ path: '.env.test', override: true, quiet: true });
    if (loaded.error) throw loaded.error;
    const env = validateEnvironment(process.env);
    assert.equal(
      env.NODE_ENV,
      'test',
      'Integration tests require NODE_ENV=test',
    );
    assert.match(
      env.DB_NAME,
      /_test$/,
      'Use a dedicated database ending in _test',
    );
    dataSource = new DataSource({
      ...databaseOptions(env),
      entities: [
        EntityProbe,
        User,
        Company,
        Membership,
        EmailVerificationRequest,
        AuthSession,
        RefreshToken,
      ],
    });
    await dataSource.initialize();
    assert.deepEqual(
      await dataSource.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'app'`,
      ),
      [],
      'Start with an empty test database',
    );
  });

  after(async () => {
    await app?.close();
    if (dataSource?.isInitialized) {
      if (ownsMigrations) {
        await dataSource.undoLastMigration();
        await dataSource.undoLastMigration();
        await dataSource.undoLastMigration();
      }
      await dataSource.destroy();
    }
  });

  it('runs, reverts, and reapplies all migrations', async () => {
    assert.equal((await dataSource.runMigrations()).length, 3);
    ownsMigrations = true;
    assert.deepEqual(
      await dataSource.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'app'`,
      ),
      [{ schema_name: 'app' }],
    );
    assert.equal((await dataSource.runMigrations()).length, 0);
    await dataSource.undoLastMigration();
    assert.equal(await dataSource.getRepository(User).count(), 0);
    await dataSource.undoLastMigration();
    assert.deepEqual(
      await dataSource.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'app'`,
      ),
      [],
    );
    await dataSource.undoLastMigration();
    assert.deepEqual(
      await dataSource.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'app'`,
      ),
      [],
    );
    assert.equal((await dataSource.runMigrations()).length, 3);
  });

  it('persists UUIDs and timezone-aware creation and update timestamps', async () => {
    await dataSource.query(`
      CREATE TABLE app.base_entity_probe (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        value text NOT NULL
      )
    `);
    try {
      const metadata = dataSource.getMetadata(EntityProbe);
      assert.equal(
        metadata.findColumnWithPropertyName('createdAt')?.type,
        'timestamptz',
      );
      assert.equal(
        metadata.findColumnWithPropertyName('updatedAt')?.type,
        'timestamptz',
      );
      const repository = dataSource.getRepository(EntityProbe);
      const entity = await repository.save(
        repository.create({ value: 'first' }),
      );
      assert.match(entity.id, /^[0-9a-f-]{36}$/);
      assert.ok(entity.createdAt instanceof Date);
      assert.ok(entity.updatedAt instanceof Date);
      const originalCreatedAt = entity.createdAt.getTime();
      const originalUpdatedAt = entity.updatedAt.getTime();
      await dataSource.query('SELECT pg_sleep(0.02)');
      entity.value = 'updated';
      const updated = await repository.save(entity);
      assert.equal(updated.id, entity.id);
      assert.equal(updated.createdAt.getTime(), originalCreatedAt);
      assert.ok(updated.updatedAt.getTime() > originalUpdatedAt);
    } finally {
      await dataSource.query('DROP TABLE app.base_entity_probe');
    }
  });

  it('serves the real module with a live database', async () => {
    const { AppModule } = await import('../src/app/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication(new ApiExpressAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api');
    await app.init();
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });

  it('creates an unverified owner and queues verification without exposing credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send(signup)
      .expect(201);
    const body = SignupResponseSchema.parse(response.body);
    assert.deepEqual(body.user, {
      id: body.user.id,
      email: 'owner@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      emailVerifiedAt: null,
      status: 'active',
    });
    assert.equal(body.company.name, 'Analytical Engines');
    assert.match(body.company.slug, /^analytical-engines-[0-9a-f-]{36}$/);
    assert.deepEqual(body.membership, {
      id: body.membership.id,
      userId: body.user.id,
      companyId: body.company.id,
      isOwner: true,
      status: 'active',
    });
    assert.deepEqual(await counts(), {
      users: 1,
      companies: 1,
      memberships: 1,
      requests: 1,
    });
    const stored = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: body.user.id })
      .getOneOrFail();
    assert.match(stored.passwordHash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.equal(await verify(stored.passwordHash, signup.password), true);
    assert.equal(
      await verify(stored.passwordHash, signup.password.trim()),
      false,
    );
    assert.ok(stored.createdAt instanceof Date);
    assert.ok(stored.updatedAt instanceof Date);
    const publicUser = await dataSource.getRepository(User).findOneByOrFail({
      id: body.user.id,
    });
    assert.equal(publicUser.passwordHash, undefined);
    const queued = await dataSource
      .getRepository(EmailVerificationRequest)
      .findOneByOrFail({ userId: body.user.id });
    assert.equal(queued.processedAt, null);
    const rows = await dataSource.query(`
      SELECT row_to_json(u) AS data FROM app.users u
      UNION ALL SELECT row_to_json(c) FROM app.companies c
      UNION ALL SELECT row_to_json(m) FROM app.memberships m
      UNION ALL SELECT row_to_json(r) FROM app.email_verification_requests r
    `);
    assert.ok(!JSON.stringify(rows).includes(signup.password));
    assert.doesNotMatch(response.text, /password|argon2/i);
  });

  it('returns 409 for normalized duplicate emails without leaving extra rows', async () => {
    const before = await counts();
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...signup, email: ' OWNER@EXAMPLE.COM ' })
      .expect(409);
    assert.equal(
      response.body.message,
      'An account with this email already exists.',
    );
    assert.doesNotMatch(response.text, /password|argon2|INSERT|constraint/i);
    assert.deepEqual(await counts(), before);
  });

  it('allows only one concurrent signup for an email and preserves both successful workspaces', async () => {
    const responses = await Promise.all(
      ['concurrent@example.com', ' CONCURRENT@EXAMPLE.COM '].map((email) =>
        request(app.getHttpServer())
          .post('/api/auth/signup')
          .send({ ...signup, email }),
      ),
    );
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [201, 409],
    );
    assert.deepEqual(await counts(), {
      users: 2,
      companies: 2,
      memberships: 2,
      requests: 2,
    });
    const companies = await dataSource.getRepository(Company).find();
    assert.equal(companies[0]?.name, companies[1]?.name);
    assert.notEqual(companies[0]?.slug, companies[1]?.slug);
    const hashes = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .getMany();
    assert.notEqual(hashes[0]?.passwordHash, hashes[1]?.passwordHash);
    for (const response of responses) {
      assert.doesNotMatch(response.text, /password|argon2/i);
    }
  });

  it('rejects weak passwords and invalid fields before writing any rows', async () => {
    const before = await counts();
    for (const changes of [
      { password: 'weak-secret' },
      { password: 'a'.repeat(129) },
      { email: 'invalid' },
      { firstName: '' },
      { lastName: '' },
      { companyName: '' },
      { isOwner: false },
    ]) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({ ...signup, ...changes })
        .expect(400);
      const validation = ValidationErrorResponseSchema.parse(response.body);
      const field = Object.keys(changes)[0]!;
      if (field === 'isOwner') {
        assert.ok(validation.formErrors.length > 0);
      } else {
        assert.ok(validation.fieldErrors[field]?.length);
      }
      assert.doesNotMatch(response.text, /weak-secret|argon2|passwordHash/);
    }
    assert.deepEqual(await counts(), before);
  });

  it('rolls back user, company, membership and verification work when a late insert fails', async () => {
    const before = await counts();
    await dataSource.query(`
      CREATE FUNCTION app.reject_signup_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'private database failure' USING ERRCODE = '23505';
      END
      $$
    `);
    try {
      for (const table of ['memberships', 'email_verification_requests']) {
        await dataSource.query(`
          CREATE TRIGGER reject_signup_insert BEFORE INSERT ON app.${table}
          FOR EACH ROW EXECUTE FUNCTION app.reject_signup_insert()
        `);
        try {
          const response = await request(app.getHttpServer())
            .post('/api/auth/signup')
            .send({ ...signup, email: 'rollback@example.com' })
            .expect(500);
          assert.equal(response.body.message, 'Internal server error');
          assert.doesNotMatch(
            response.text,
            /private database|password|argon2|INSERT|23505/i,
          );
          assert.deepEqual(await counts(), before);
        } finally {
          await dataSource.query(
            `DROP TRIGGER reject_signup_insert ON app.${table}`,
          );
        }
      }
    } finally {
      await dataSource.query('DROP FUNCTION app.reject_signup_insert()');
    }
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...signup, email: 'rollback@example.com', companyName: '会社' })
      .expect(201)
      .expect((response) => {
        assert.match(response.body.company.slug, /^company-[0-9a-f-]{36}$/);
      });
  });

  it('returns unavailable health after disconnection', async () => {
    await app.get(DataSource).destroy();
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(503);
    assert.equal(response.body.statusCode, 503);
    assert.equal(response.body.path, '/api/health');
  });
});
