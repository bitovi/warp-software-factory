import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ErrorRequestHandler } from 'express';

export class ApiExpressAdapter extends ExpressAdapter {
  override setErrorHandler(handler: ErrorRequestHandler, prefix?: string) {
    const normalizeParserError: ErrorRequestHandler = (
      exception: unknown,
      request,
      response,
      next,
    ) => {
      let normalized = exception;
      // Nest replaces parser SyntaxErrors before filters run, losing their type metadata.
      if (
        exception instanceof Error &&
        'type' in exception &&
        'statusCode' in exception &&
        'status' in exception &&
        'expose' in exception &&
        exception.expose === true &&
        exception.status === exception.statusCode
      ) {
        if (
          exception.type === 'entity.too.large' &&
          exception.statusCode === 413
        ) {
          normalized = new PayloadTooLargeException('Request body too large');
        } else if (
          exception instanceof SyntaxError &&
          exception.type === 'entity.parse.failed' &&
          exception.statusCode === 400
        ) {
          normalized = new BadRequestException('Malformed JSON');
        }
      }
      return handler(normalized, request, response, next);
    };
    return super.setErrorHandler(normalizeParserError, prefix);
  }
}
