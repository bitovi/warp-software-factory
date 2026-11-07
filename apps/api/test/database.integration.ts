import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import request from 'supertest';
import { Column, DataSource, Entity } from 'typeorm';
import { ApiExpressAdapter } from '../src/common/api-express.adapter';
import { validateEnvironment } from '../src/config/environment';
import { databaseOptions } from '../src/database/database-options';
import { BaseEntity } from '../src/database/entities/base.entity';

@Entity({ name: 'base_entity_probe', schema: 'app' })
class EntityProbe extends BaseEntity {
  @Column()
  value!: string;
}

describe('PostgreSQL foundation', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let ownsMigration = false;

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
      entities: [EntityProbe],
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
      if (ownsMigration) await dataSource.undoLastMigration();
      await dataSource.destroy();
    }
  });

  it('runs, reverts, and reapplies the infrastructure migration', async () => {
    assert.equal((await dataSource.runMigrations()).length, 1);
    ownsMigration = true;
    assert.deepEqual(
      await dataSource.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'app'`,
      ),
      [{ schema_name: 'app' }],
    );
    assert.equal((await dataSource.runMigrations()).length, 0);
    await dataSource.undoLastMigration();
    assert.deepEqual(
      await dataSource.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'app'`,
      ),
      [],
    );
    assert.equal((await dataSource.runMigrations()).length, 1);
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

  it('serves the real module with a live database and fails after disconnection', async () => {
    const { AppModule } = await import('../src/app.module');
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
    await app.get(DataSource).destroy();
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(503);
    assert.equal(response.body.statusCode, 503);
    assert.equal(response.body.path, '/api/health');
  });
});
