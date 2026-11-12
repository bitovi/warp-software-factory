import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { configureApi } from '@wsf/api/core';
import { AppModule } from './app/app.module';
import { ApiExpressAdapter } from './common/api-express.adapter';
import { Environment } from './config/environment';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ApiExpressAdapter());
  configureApi(app);
  const config = app.get(ConfigService<Environment, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API is running on: http://localhost:${port}/api`);
}

bootstrap().catch((error: unknown) => {
  Logger.error(error);
  process.exitCode = 1;
});
