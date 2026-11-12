import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  INestApplication,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Public } from '@wsf/api/core';
import { AuthStore } from '@wsf/api/feature-auth';
import { randomBytes, randomUUID } from 'node:crypto';
import { ValidationErrorResponseSchema } from '@wsf/shared/schemas';
import { NextFunction, Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { ApiExpressAdapter } from '../src/common/api-express.adapter';

class InputDto extends createZodDto(
  z.object({ count: z.number().int().min(1) }),
) {}

@Controller('validation')
@Public()
class ValidationController {
  @Post()
  create(@Body() body: InputDto): InputDto {
    return body;
  }

  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException(['Invalid request']);
  }

  @Get('unexpected')
  unexpected(): never {
    throw Object.assign(new Error('private database details'), {
      status: 413,
      statusCode: 413,
      expose: true,
    });
  }
}

describe('global HTTP behavior', () => {
  let app: INestApplication;
  const query = mock.fn(async () => [{ result: 1 }]);
  let accessToken: string;

  before(async () => {
    Object.assign(process.env, {
      DB_HOST: 'localhost',
      DB_NAME: 'api_test',
      DB_USER: 'api',
      DB_PASSWORD: 'test-only',
      JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
      AUTH_ORIGIN: 'https://app.example.test',
    });
    const { AppModule } = await import('../src/app/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationController],
    })
      .overrideProvider(DataSource)
      .useValue({ query, isInitialized: false })
      .overrideProvider(AuthStore)
      .useValue({ currentUser: async () => ({}) })
      .compile();
    accessToken = await module.get(JwtService).signAsync({
      sub: randomUUID(),
      companyId: randomUUID(),
      membershipId: randomUUID(),
      sid: randomUUID(),
    });
    app = module.createNestApplication(new ApiExpressAdapter(), {
      logger: false,
    });
    app.use(
      '/external-error',
      (_request: Request, _response: Response, next: NextFunction) => {
        next(
          Object.assign(new Error('private middleware details'), {
            status: 413,
            statusCode: 413,
            expose: true,
            type: 'unrecognized',
          }),
        );
      },
    );
    app.setGlobalPrefix('api');
    await app.init();
  });

  after(async () => {
    await app?.close();
  });

  it('checks the database and returns its status', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });

  it('validates DTOs through the global pipe', async () => {
    await request(app.getHttpServer())
      .post('/api/validation')
      .send({ count: 2 })
      .expect(201)
      .expect({ count: 2 });
    const response = await request(app.getHttpServer())
      .post('/api/validation')
      .send({ count: 'private-input' })
      .expect(400);
    assert.equal(response.body.statusCode, 400);
    assert.equal(response.body.path, '/api/validation');
    assert.equal(response.body.message, 'Validation failed');
    assert.equal(response.body.issues[0].path[0], 'count');
    assert.ok(response.body.error);
    assert.ok(Number.isFinite(Date.parse(response.body.timestamp)));
    assert.doesNotMatch(JSON.stringify(response.body), /private-input|stack/);
  });

  it('preserves shared field and form errors inside the global envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/tasks')
      .auth(accessToken, { type: 'bearer' })
      .send({ title: ' ', completed: 'private-input' })
      .expect(400);
    const validation = ValidationErrorResponseSchema.parse(response.body);
    assert.deepEqual(validation.fieldErrors['title'], ['Enter a task title.']);
    assert.ok(validation.fieldErrors['completed']?.length);
    assert.deepEqual(validation.formErrors, []);
    assert.equal(response.body.path, '/api/tasks');
    assert.ok(response.body.error);
    assert.ok(Number.isFinite(Date.parse(response.body.timestamp)));
    assert.doesNotMatch(JSON.stringify(response.body), /private-input|stack/);

    const emptyUpdate = await request(app.getHttpServer())
      .patch('/api/tasks/738dbdca-09d8-47d9-af39-3fb3663fd71c')
      .auth(accessToken, { type: 'bearer' })
      .send({})
      .expect(400);
    const formValidation = ValidationErrorResponseSchema.parse(
      emptyUpdate.body,
    );
    assert.deepEqual(formValidation.fieldErrors, {});
    assert.deepEqual(formValidation.formErrors, [
      'Provide at least one task field.',
    ]);
  });

  it('normalizes framework errors and keeps the API prefix', async () => {
    const missing = await request(app.getHttpServer())
      .get('/health')
      .expect(404);
    assert.equal(missing.body.statusCode, 404);
    assert.equal(missing.body.path, '/health');
    const invalid = await request(app.getHttpServer())
      .get('/api/validation/bad-request')
      .expect(400);
    assert.deepEqual(invalid.body.message, ['Invalid request']);
    assert.equal(invalid.body.error, 'Bad Request');
  });

  it('preserves the payload limit status without exposing parser details', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/validation')
      .send({ count: 1, value: 'private-input'.repeat(10000) })
      .expect(413);
    assert.equal(response.body.statusCode, 413);
    assert.equal(response.body.error, 'Payload Too Large');
    assert.equal(response.body.message, 'Request body too large');
    assert.equal(response.body.path, '/api/validation');
    assert.ok(Number.isFinite(Date.parse(response.body.timestamp)));
    assert.deepEqual(Object.keys(response.body).sort(), [
      'error',
      'message',
      'path',
      'statusCode',
      'timestamp',
    ]);
  });

  it('returns a redacted bad request for malformed JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/validation')
      .set('Content-Type', 'application/json')
      .send('private-input')
      .expect(400);
    assert.equal(response.body.statusCode, 400);
    assert.equal(response.body.error, 'Bad Request');
    assert.equal(response.body.message, 'Malformed JSON');
    assert.equal(response.body.path, '/api/validation');
    assert.ok(Number.isFinite(Date.parse(response.body.timestamp)));
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /private-input|stack|body/,
    );
  });

  it('redacts unexpected failures', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/validation/unexpected')
      .expect(500);
    assert.equal(response.body.message, 'Internal server error');
    assert.equal(response.body.error, 'Internal Server Error');
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /private database|stack/,
    );
  });

  it('keeps unrecognized external middleware errors internal', async () => {
    const response = await request(app.getHttpServer())
      .get('/external-error')
      .expect(500);
    assert.equal(response.body.statusCode, 500);
    assert.equal(response.body.message, 'Internal server error');
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /private middleware|stack/,
    );
  });

  it('returns 503 instead of reporting a failed database as healthy', async () => {
    query.mock.mockImplementationOnce(async () => {
      throw new Error('private connection details');
    });
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(503);
    assert.equal(response.body.statusCode, 503);
    assert.equal(response.body.error, 'Service Unavailable');
    assert.equal(response.body.message, 'Service unavailable');
    assert.equal(response.body.path, '/api/health');
    assert.doesNotMatch(JSON.stringify(response.body), /private connection/);
  });
});
