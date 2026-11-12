import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ValidationErrorResponseSchema } from '@wsf/shared/schemas';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException && statusCode < 500) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else {
        const details = body as { message?: string | string[]; error?: string };
        message = details.message ?? exception.message;
        error = details.error ?? exception.name;
      }
    } else if (statusCode === HttpStatus.SERVICE_UNAVAILABLE) {
      message = 'Service unavailable';
      error = 'Service Unavailable';
    }

    if (statusCode >= 500) {
      this.logger.error(`Request failed with status ${statusCode}`);
    }

    const validationError =
      exception instanceof ZodValidationException
        ? exception.getZodError()
        : undefined;
    const sharedValidation =
      exception instanceof HttpException &&
      statusCode === HttpStatus.BAD_REQUEST
        ? ValidationErrorResponseSchema.safeParse(exception.getResponse())
        : undefined;
    response.status(statusCode).json({
      statusCode,
      error,
      message,
      path: request.path,
      timestamp: new Date().toISOString(),
      ...(sharedValidation?.success
        ? {
            fieldErrors: sharedValidation.data.fieldErrors,
            formErrors: sharedValidation.data.formErrors,
          }
        : {}),
      ...(validationError instanceof ZodError
        ? {
            issues: validationError.issues.map((issue) => ({
              path: issue.path,
              code: issue.code,
              message: issue.message,
            })),
          }
        : {}),
    });
  }
}
