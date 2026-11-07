import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { configureApi } from '@wsf/api/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApi(app);
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
  Logger.log(`API is running on: http://localhost:${port}/api`);
}

bootstrap().catch((error: unknown) => {
  Logger.error(error);
  process.exitCode = 1;
});
