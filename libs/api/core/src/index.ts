import type { INestApplication } from '@nestjs/common';

export { ZodValidationPipe } from './lib/zod-validation.pipe';
export * from './lib/auth.decorators';

export function configureApi(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
}
