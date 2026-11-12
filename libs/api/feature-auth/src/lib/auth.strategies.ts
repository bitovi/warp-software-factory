import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AccessClaimsSchema, LoginSchema } from '@wsf/shared/schemas';
import type { Request } from 'express';
import { ExtractJwt, Strategy as JwtStrategy } from 'passport-jwt';
import { Strategy as LocalStrategy } from 'passport-local';
import { z } from 'zod';
import { AuthService } from './auth.service';

@Injectable()
export class PasswordStrategy extends PassportStrategy(LocalStrategy) {
  constructor(private readonly auth: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(req: Request): Promise<{ id: string }> {
    const input = LoginSchema.safeParse(req.body);
    if (!input.success)
      throw new UnauthorizedException('Invalid email or password.');
    return { id: await this.auth.authenticate(input.data) };
  }
}

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(JwtStrategy) {
  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithms: ['HS256'],
      issuer: 'wsf-api',
      audience: 'wsf-client',
      ignoreExpiration: false,
    });
  }

  async validate(payload: unknown) {
    const claims = AccessClaimsSchema.extend({
      exp: z.number().int(),
      iat: z.number().int(),
    }).safeParse(payload);
    if (!claims.success) throw new UnauthorizedException();
    await this.auth.me(claims.data);
    return AccessClaimsSchema.parse(claims.data);
  }
}
