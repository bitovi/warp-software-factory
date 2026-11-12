import { z } from 'zod';

export const SignupSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z
    .string()
    .min(12, 'Use at least 12 characters.')
    .max(128, 'Use no more than 128 characters.'),
  firstName: z.string().trim().min(1, 'Enter your first name.').max(100),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(100),
  companyName: z.string().trim().min(1, 'Enter a company name.').max(200),
});

export const SignupResponseSchema = z.strictObject({
  user: z.strictObject({
    id: z.uuid(),
    email: z.email(),
    firstName: z.string(),
    lastName: z.string(),
    emailVerifiedAt: z.null(),
    status: z.literal('active'),
  }),
  company: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  membership: z.strictObject({
    id: z.uuid(),
    userId: z.uuid(),
    companyId: z.uuid(),
    isOwner: z.literal(true),
    status: z.literal('active'),
  }),
});

export type Signup = z.infer<typeof SignupSchema>;
export type SignupResponse = z.infer<typeof SignupResponseSchema>;
