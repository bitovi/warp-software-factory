import type { Signup, SignupResponse } from '@wsf/shared/schemas';

export type NewOwner = Omit<Signup, 'password'> & { passwordHash: string };

export abstract class SignupStore {
  abstract createOwner(input: NewOwner): Promise<SignupResponse>;
}
