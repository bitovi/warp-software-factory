import { z } from 'zod';

const port = z
  .string()
  .regex(/^\d+$/, 'Must be a whole number')
  .transform(Number)
  .pipe(z.number().int().min(1).max(65535));

export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: port.default(3000),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32)
      .refine(
        (value) => value.trim().length >= 32,
        'Use at least 32 nonblank characters',
      ),
    AUTH_ORIGIN: z.url().refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
    }, 'Use an HTTP(S) origin without a path'),
    DB_HOST: z.string().trim().min(1),
    DB_PORT: port.default(5432),
    DB_NAME: z.string().trim().min(1),
    DB_USER: z.string().trim().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' || env.AUTH_ORIGIN.startsWith('https://'),
    {
      path: ['AUTH_ORIGIN'],
      message: 'Production requires HTTPS',
    },
  );

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }
  return result.data;
}
