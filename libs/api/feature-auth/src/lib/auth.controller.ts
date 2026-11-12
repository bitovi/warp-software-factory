import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser, Public, ZodValidationPipe } from '@wsf/api/core';
import type { AccessClaims } from '@wsf/shared/schemas';
import type { CookieOptions, Request, Response } from 'express';
import {
  SignupSchema,
  type Signup,
  type SignupResponse,
} from '@wsf/shared/schemas';
import { SignupService } from './signup.service';
import { AuthService } from './auth.service';
import { LocalAuthGuard, SameOriginGuard } from './auth.guards';

const cookieName = '__Secure-wsf-refresh';
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth',
};

function refreshCookie(req: Request): string | null {
  const values = (req.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`));
  const [value] = values;
  if (values.length !== 1 || !value) return null;
  const token = value.slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly signupService: SignupService,
    private readonly auth: AuthService,
  ) {}

  @Post('signup')
  @Public()
  signup(
    @Body(new ZodValidationPipe(SignupSchema)) input: Signup,
  ): Promise<SignupResponse> {
    return this.signupService.signup(input);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SameOriginGuard, ThrottlerGuard, LocalAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async login(
    @Req() req: Request & { user: { id: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(req.user.id);
    res.cookie(cookieName, result.refreshToken, {
      ...cookieOptions,
      expires: result.expiresAt,
    });
    return result.body;
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SameOriginGuard)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.auth.refresh(refreshCookie(req));
      res.cookie(cookieName, result.refreshToken, {
        ...cookieOptions,
        expires: result.expiresAt,
      });
      return result.body;
    } catch (error) {
      res.clearCookie(cookieName, cookieOptions);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SameOriginGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    try {
      await this.auth.logout(refreshCookie(req));
    } finally {
      res.clearCookie(cookieName, cookieOptions);
    }
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: AccessClaims) {
    return this.auth.me(user);
  }
}
