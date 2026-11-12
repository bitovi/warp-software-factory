import { z } from 'zod';

const positiveInteger = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .pipe(
    z.coerce
      .number<string | number>()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
  );

export const PaginationQuerySchema = z.strictObject({
  page: positiveInteger.default(1),
  pageSize: positiveInteger.pipe(z.number().max(100)).default(10),
});

export const QuerySchema = PaginationQuerySchema.extend({
  sort: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().trim().max(120).default(''),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type Query = z.infer<typeof QuerySchema>;
