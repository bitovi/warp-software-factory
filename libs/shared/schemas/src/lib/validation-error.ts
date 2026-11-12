import { z } from 'zod';

export const ValidationErrorResponseSchema = z.strictObject({
  statusCode: z.literal(400),
  message: z.literal('Validation failed'),
  fieldErrors: z.record(z.string(), z.array(z.string())),
  formErrors: z.array(z.string()),
  error: z.string().optional(),
  path: z.string().optional(),
  timestamp: z.iso.datetime().optional(),
});

export type ValidationErrorResponse = z.infer<
  typeof ValidationErrorResponseSchema
>;
