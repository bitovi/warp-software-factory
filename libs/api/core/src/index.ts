import type { INestApplication } from '@nestjs/common';

export function configureApi(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
}
