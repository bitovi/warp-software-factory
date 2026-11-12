import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { ValidationErrorResponseSchema } from '@wsf/shared/schemas';
import { z } from 'zod';

export class ZodValidationPipe<T extends z.ZodType>
  implements PipeTransform<unknown, z.infer<T>>
{
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        ValidationErrorResponseSchema.parse({
          statusCode: 400,
          message: 'Validation failed',
          ...z.flattenError(result.error),
        }),
      );
    }
    return result.data;
  }
}
