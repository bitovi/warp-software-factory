import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  AccessClaimsSchema,
  AuthMeResponseSchema,
  TokenResponseSchema,
  type AccessClaims,
} from '@wsf/shared/schemas';
import { config } from 'dotenv';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import { ApiExpressAdapter } from '../src/common/api-express.adapter';
import { validateEnvironment } from '../src/config/environment';
import { databaseOptions } from '../src/database-options';
import { AuthSession } from '../src/database/entities/auth-session.entity';
import { Company } from '../src/database/entities/company.entity';
import { Membership } from '../src/database/entities/membership.entity';
import { RefreshToken } from '../src/database/entities/refresh-token.entity';
import { User } from '../src/database/entities/user.entity';

describe('PostgreSQL authentication', () => {
  let app: INestApplication;
  let db: DataSource;
  let jwt: JwtService;
  let user: User;
  let membership: Membership;
  let ownsMigrations = false;
  let authOrigin: string;
  const credentials = {
    email: 'login@example.com',
    password: '  a secure passphrase  ',
  };
  const setCookie = (response: Response): string => {
    const headers = response.headers['set-cookie'] as unknown as string[];
    assert.equal(headers.length, 1);
    const [header] = headers;
    assert.ok(header);
    return header;
  };
  const cookie = (response: Response): string => {
    const [value] = setCookie(response).split(';');
    assert.ok(value);
    return value;
  };
  const claims = (response: Response): AccessClaims =>
    AccessClaimsSchema.parse(jwt.decode(response.body.accessToken));
  const login = () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(credentials);
  const refresh = (value: string) =>
    request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', value);
  const logout = (value: string) =>
    request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', value);
  const me = (token: string) =>
    request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(token, { type: 'bearer' });

  before(async () => {
    const loaded = config({ path: '.env.test', override: true, quiet: true });
    if (loaded.error) throw loaded.error;
    const env = validateEnvironment(process.env);
    authOrigin = env.AUTH_ORIGIN;
    assert.equal(env.NODE_ENV, 'test');
    assert.match(env.DB_NAME, /_test$/);
    db = new DataSource(databaseOptions(env));
    await db.initialize();
    assert.deepEqual(
      await db.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'app'`,
      ),
      [],
    );
    await db.runMigrations();
    ownsMigrations = true;
    const { AppModule } = await import('../src/app/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication(new ApiExpressAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api');
    await app.init();
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        ...credentials,
        firstName: 'Ada',
        lastName: 'Lovelace',
        companyName: 'Engines',
      })
      .expect(201);
    user = await db
      .getRepository(User)
      .findOneByOrFail({ email: credentials.email });
    membership = await db
      .getRepository(Membership)
      .findOneByOrFail({ userId: user.id });
  });

  after(async () => {
    await app?.close();
    if (db?.isInitialized) {
      if (ownsMigrations)
        for (let index = 0; index < 3; index++) await db.undoLastMigration();
      await db.destroy();
    }
  });

  it('logs in with normalized credentials, a secure cookie, safe identity and a 15-minute JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Origin', authOrigin)
      .send({ ...credentials, email: ' LOGIN@EXAMPLE.COM ' })
      .expect(200);
    TokenResponseSchema.parse(response.body);
    assert.equal(response.headers['cache-control'], 'no-store');
    const header = setCookie(response);
    assert.match(header, /; HttpOnly/);
    assert.match(header, /; Secure/);
    assert.match(header, /; SameSite=Strict/);
    assert.match(header, /; Path=\/api\/auth/);
    assert.doesNotMatch(header, /Domain=/);
    const payload = jwt.decode(response.body.accessToken);
    assert.equal(payload.exp - payload.iat, 900);
    assert.deepEqual(claims(response), {
      sub: user.id,
      companyId: membership.companyId,
      membershipId: membership.id,
      sid: payload.sid,
    });
    const [, rawToken] = cookie(response).split('=');
    assert.ok(rawToken);
    const stored = await db
      .getRepository(RefreshToken)
      .createQueryBuilder('token')
      .addSelect('token.tokenHash')
      .where('token.sessionId = :id', { id: payload.sid })
      .getOneOrFail();
    assert.equal(
      stored.tokenHash,
      createHash('sha256').update(rawToken).digest('hex'),
    );
    assert.notEqual(stored.tokenHash, rawToken);
    const identity = await me(response.body.accessToken).expect(200);
    const body = AuthMeResponseSchema.parse(identity.body);
    assert.equal(body.user.id, user.id);
    assert.equal(body.company.id, membership.companyId);
    assert.equal(body.memberships[0]?.id, membership.id);
    assert.doesNotMatch(identity.text, /password|Hash|refreshToken/i);
    await request(app.getHttpServer())
      .get('/api/tasks')
      .auth(response.body.accessToken, { type: 'bearer' })
      .expect(200);
    await db.getRepository(User).update(user.id, { status: 'disabled' });
    try {
      await me(response.body.accessToken).expect(401);
      await refresh(cookie(response)).expect(401);
    } finally {
      await db.getRepository(User).update(user.id, { status: 'active' });
    }
  });

  it('returns the same generic 401 for invalid, missing, unknown and disabled credentials', async () => {
    for (const input of [
      { ...credentials, password: 'wrong-password' },
      { ...credentials, email: 'unknown@example.com' },
      { ...credentials, password: credentials.password.trim() },
      { email: credentials.email },
      { ...credentials, companyId: randomUUID() },
    ]) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(input)
        .expect(401);
      assert.equal(response.body.message, 'Invalid email or password.');
      assert.equal(response.headers['set-cookie'], undefined);
      assert.doesNotMatch(response.text, /argon2|passwordHash|unknown@example/);
    }
    await db.getRepository(User).update(user.id, { status: 'disabled' });
    try {
      const response = await login().expect(401);
      assert.equal(response.body.message, 'Invalid email or password.');
    } finally {
      await db.getRepository(User).update(user.id, { status: 'active' });
    }
  });

  it('protects demo resources and rejects invalid signatures, expired tokens and forged membership claims', async () => {
    for (const [method, path] of [
      ['get', '/api/tasks'],
      ['post', '/api/tasks'],
      ['patch', `/api/tasks/${randomUUID()}`],
      ['get', '/api/auth/me'],
    ] as const) {
      await request(app.getHttpServer())[method](path).expect(401);
    }
    const response = await login().expect(200);
    const valid = claims(response);
    const invalidTokens = [
      'not-a-jwt',
      await jwt.signAsync(valid, {
        secret: randomBytes(48).toString('base64url'),
      }),
      await jwt.signAsync(valid, { expiresIn: -1 }),
      await new JwtService({
        secret: process.env['JWT_ACCESS_SECRET'],
        signOptions: {
          algorithm: 'HS256',
          issuer: 'wsf-api',
          audience: 'wsf-client',
        },
      }).signAsync(valid),
      await jwt.signAsync(valid, { audience: 'other-app' }),
      await jwt.signAsync(valid, { algorithm: 'HS384' }),
      await jwt.signAsync({ ...valid, sub: randomUUID() }),
      await jwt.signAsync({ ...valid, companyId: randomUUID() }),
      await jwt.signAsync({ ...valid, membershipId: randomUUID() }),
      await jwt.signAsync({ ...valid, sid: randomUUID() }),
    ];
    for (const token of invalidTokens) await me(token).expect(401);
    await request(app.getHttpServer()).get('/api/health').expect(200);
    await request(app.getHttpServer()).get('/api/status').expect(200);
  });

  it('rotates once and commits family revocation on replay without affecting another session', async () => {
    const original = await login().expect(200);
    const other = await login().expect(200);
    const rotated = await refresh(cookie(original)).expect(200);
    assert.notEqual(cookie(rotated), cookie(original));
    await me(rotated.body.accessToken).expect(200);
    const replay = await refresh(cookie(original)).expect(401);
    assert.match(setCookie(replay), /Expires=Thu, 01 Jan 1970/);
    const session = await db
      .getRepository(AuthSession)
      .findOneByOrFail({ id: claims(original).sid });
    assert.ok(session.revokedAt);
    await refresh(cookie(rotated)).expect(401);
    await me(rotated.body.accessToken).expect(401);
    await me(other.body.accessToken).expect(200);
  });

  it('serializes concurrent refreshes and revokes the winning descendant after detecting replay', async () => {
    const original = await login().expect(200);
    const results = await Promise.all([
      refresh(cookie(original)),
      refresh(cookie(original)),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 401]);
    const winner = results.find((result) => result.status === 200);
    assert.ok(winner);
    assert.equal(
      await db
        .getRepository(RefreshToken)
        .countBy({ sessionId: claims(original).sid }),
      2,
    );
    await refresh(cookie(winner)).expect(401);
    await me(winner.body.accessToken).expect(401);
  });

  it('revokes logout families, including consumed ancestors and races with rotation, and clears cookies', async () => {
    const original = await login().expect(200);
    const rotated = await refresh(cookie(original)).expect(200);
    const result = await logout(cookie(original)).expect(204);
    const header = setCookie(result);
    assert.match(header, /; Path=\/api\/auth/);
    assert.match(header, /; HttpOnly; Secure; SameSite=Strict/);
    assert.match(header, /Expires=Thu, 01 Jan 1970/);
    await refresh(cookie(rotated)).expect(401);
    await me(rotated.body.accessToken).expect(401);
    await logout(cookie(rotated)).expect(204);
    const racing = await login().expect(200);
    const [rotation, signedOut] = await Promise.all([
      refresh(cookie(racing)),
      logout(cookie(racing)),
    ]);
    assert.equal(signedOut.status, 204);
    assert.ok([200, 401].includes(rotation.status));
    if (rotation.status === 200) await refresh(cookie(rotation)).expect(401);
    await me(racing.body.accessToken).expect(401);
  });

  it('rolls back token consumption and session creation on an insert failure', async () => {
    const original = await login().expect(200);
    const sessionCount = await db.getRepository(AuthSession).count();
    await db.query(`CREATE FUNCTION app.reject_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'private refresh failure'; END $$`);
    await db.query(
      `CREATE TRIGGER reject_refresh BEFORE INSERT ON app.refresh_tokens FOR EACH ROW EXECUTE FUNCTION app.reject_refresh()`,
    );
    try {
      const result = await refresh(cookie(original)).expect(500);
      assert.doesNotMatch(result.text, /private refresh|INSERT|tokenHash/);
      await login().expect(500);
      assert.equal(await db.getRepository(AuthSession).count(), sessionCount);
      const token = await db
        .getRepository(RefreshToken)
        .findOneByOrFail({ sessionId: claims(original).sid });
      assert.equal(token.consumedAt, null);
    } finally {
      await db.query('DROP TRIGGER reject_refresh ON app.refresh_tokens');
      await db.query('DROP FUNCTION app.reject_refresh()');
    }
    await refresh(cookie(original)).expect(200);
  });

  it('chooses the last active membership, falls back to the first, and rejects lost authorization', async () => {
    const company = await db
      .getRepository(Company)
      .save({ name: 'Second', slug: randomUUID() });
    const second = await db.getRepository(Membership).save({
      userId: user.id,
      companyId: company.id,
      status: 'active',
      isOwner: false,
    });
    await db
      .getRepository(User)
      .update(user.id, { lastMembershipId: second.id });
    const preferred = await login().expect(200);
    assert.equal(claims(preferred).membershipId, second.id);
    const identity = AuthMeResponseSchema.parse(
      (await me(preferred.body.accessToken).expect(200)).body,
    );
    assert.equal(identity.memberships.length, 2);
    assert.equal(identity.company.id, second.companyId);
    await db
      .getRepository(Membership)
      .update(second.id, { status: 'disabled' });
    await me(preferred.body.accessToken).expect(401);
    await refresh(cookie(preferred)).expect(401);
    const fallback = await login().expect(200);
    assert.equal(claims(fallback).membershipId, membership.id);
    const outsider = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        ...credentials,
        email: 'outsider@example.com',
        firstName: 'Other',
        lastName: 'Owner',
        companyName: 'Other',
      })
      .expect(201);
    await db
      .getRepository(User)
      .update(user.id, { lastMembershipId: outsider.body.membership.id });
    assert.equal(claims(await login().expect(200)).membershipId, membership.id);
    await db
      .getRepository(Membership)
      .update(membership.id, { status: 'invited' });
    try {
      await me(fallback.body.accessToken).expect(401);
      await refresh(cookie(fallback)).expect(401);
      const response = await login().expect(401);
      assert.equal(response.body.message, 'Invalid email or password.');
    } finally {
      await db
        .getRepository(Membership)
        .update(membership.id, { status: 'active' });
    }
  });

  it('rejects expired sessions and malformed or missing cookies', async () => {
    const response = await login().expect(200);
    await db
      .getRepository(AuthSession)
      .update(claims(response).sid, { expiresAt: new Date(0) });
    await me(response.body.accessToken).expect(401);
    await refresh(cookie(response)).expect(401);
    for (const value of [
      '',
      '__Secure-wsf-refresh=bad',
      `__Secure-wsf-refresh=${'a'.repeat(43)}`,
      `${cookie(response)}; ${cookie(response)}`,
    ]) {
      await refresh(value).expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('X-Requested-With', 'XMLHttpRequest')
      .expect(204);
  });

  it('blocks cross-origin and simple form session mutations without issuing cookies', async () => {
    for (const path of ['login', 'refresh', 'logout']) {
      for (const headers of [
        {},
        {
          'X-Requested-With': 'XMLHttpRequest',
          Origin: 'https://evil.example',
        },
        {
          'X-Requested-With': 'XMLHttpRequest',
          'Sec-Fetch-Site': 'cross-site',
        },
      ]) {
        const response = await request(app.getHttpServer())
          .post(`/api/auth/${path}`)
          .set(headers)
          .send(credentials)
          .expect(403);
        assert.equal(response.headers['set-cookie'], undefined);
      }
    }
  });

  it('rate limits repeated login attempts using the real throttler guard', async () => {
    let response: Response | undefined;
    for (let index = 0; index < 21; index++) {
      response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ ...credentials, password: 'incorrect' });
      if (response.status === 429) break;
      assert.equal(response.status, 401);
    }
    assert.equal(response?.status, 429);
    assert.ok(Number(response?.headers['retry-after']) > 0);
  });
});
