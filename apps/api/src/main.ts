import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExpressAdapter } from './common/api-express.adapter';
import { Environment } from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ApiExpressAdapter());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const config = app.get(ConfigService<Environment, true>);
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap().catch(() => {
  process.exitCode = 1;
});
