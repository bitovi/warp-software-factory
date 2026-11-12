import { DynamicModule, Module, Type } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { SignupService } from './signup.service';
import { SignupStore } from './signup.store';
import { AuthStore } from './auth.store';
import { AuthService } from './auth.service';
import { JwtAuthGuard, LocalAuthGuard, SameOriginGuard } from './auth.guards';
import { AccessTokenStrategy, PasswordStrategy } from './auth.strategies';

@Module({})
export class AuthModule {
  static register(
    store: Type<SignupStore>,
    authStore: Type<AuthStore>,
  ): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        PassportModule,
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
            signOptions: {
              algorithm: 'HS256',
              expiresIn: 900,
              issuer: 'wsf-api',
              audience: 'wsf-client',
            },
          }),
        }),
      ],
      controllers: [AuthController],
      providers: [
        SignupService,
        { provide: SignupStore, useClass: store },
        AuthService,
        { provide: AuthStore, useClass: authStore },
        PasswordStrategy,
        AccessTokenStrategy,
        LocalAuthGuard,
        SameOriginGuard,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    };
  }
}
