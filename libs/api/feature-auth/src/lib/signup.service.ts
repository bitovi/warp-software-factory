import { Injectable } from '@nestjs/common';
import { type Signup, type SignupResponse } from '@wsf/shared/schemas';
import { argon2id, hash } from 'argon2';
import { SignupStore } from './signup.store';

@Injectable()
export class SignupService {
  constructor(private readonly store: SignupStore) {}

  async signup(input: Signup): Promise<SignupResponse> {
    const { password, ...owner } = input;
    const passwordHash = await hash(password, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    return this.store.createOwner({ ...owner, passwordHash });
  }
}
