import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@wsf/api/feature-auth';
import { StatusModule } from '@wsf/api/feature-status';
import { TasksModule } from '@wsf/api/feature-tasks';
import { ZodValidationPipe } from 'nestjs-zod';
import { ApiExceptionFilter } from '../common/api-exception.filter';
import { Environment, validateEnvironment } from '../config/environment';
import { databaseOptions } from '../database-options';
import { TypeOrmSignupStore } from '../database/typeorm-signup.store';
import { TypeOrmAuthStore } from '../database/typeorm-auth.store';
import { HealthController } from '../health/health.controller';

@Module({
  imports: [
    StatusModule,
    TasksModule,
    AuthModule.register(TypeOrmSignupStore, TypeOrmAuthStore),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        ...databaseOptions({
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
          DB_USER: config.get('DB_USER', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_SSL: config.get('DB_SSL', { infer: true }),
        }),
        retryAttempts: 1,
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
