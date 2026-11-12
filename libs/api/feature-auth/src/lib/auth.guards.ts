import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PUBLIC_ROUTE } from '@wsf/api/core';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    return super.canActivate(context);
  }
}

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  override handleRequest<TUser>(error: unknown, user: TUser): TUser {
    if (error || !user)
      throw new UnauthorizedException('Invalid email or password.');
    return user;
  }
}

@Injectable()
export class SameOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    return (
      req.get('X-Requested-With') === 'XMLHttpRequest' &&
      (!req.get('Origin') ||
        req.get('Origin') === this.config.getOrThrow<string>('AUTH_ORIGIN')) &&
      req.get('Sec-Fetch-Site') !== 'cross-site'
    );
  }
}
