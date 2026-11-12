import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '@wsf/api/core';
import {
  SignupSchema,
  type Signup,
  type SignupResponse,
} from '@wsf/shared/schemas';
import { SignupService } from './signup.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly signupService: SignupService) {}

  @Post('signup')
  signup(
    @Body(new ZodValidationPipe(SignupSchema)) input: Signup,
  ): Promise<SignupResponse> {
    return this.signupService.signup(input);
  }
}
