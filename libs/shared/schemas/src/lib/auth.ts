import { z } from 'zod';
import { SignupResponseSchema, SignupSchema } from './signup';

export const LoginSchema = z.strictObject({
  email: SignupSchema.shape.email,
  password: z.string().min(1).max(128),
});

export const AccessClaimsSchema = z.object({
  sub: z.uuid(),
  companyId: z.uuid(),
  membershipId: z.uuid(),
  sid: z.uuid(),
});

export const TokenResponseSchema = z.strictObject({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.literal(900),
});

export const AuthMeResponseSchema = z.strictObject({
  user: SignupResponseSchema.shape.user.extend({
    emailVerifiedAt: z.iso.datetime().nullable(),
  }),
  company: SignupResponseSchema.shape.company,
  memberships: z.array(
    SignupResponseSchema.shape.membership.extend({
      isOwner: z.boolean(),
      company: SignupResponseSchema.shape.company,
    }),
  ),
});

export type Login = z.infer<typeof LoginSchema>;
export type AccessClaims = z.infer<typeof AccessClaimsSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
