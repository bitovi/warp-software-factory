import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AccessClaims } from '@wsf/shared/schemas';

export const PUBLIC_ROUTE = 'auth:public';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessClaims =>
    context.switchToHttp().getRequest<{ user: AccessClaims }>().user,
);
