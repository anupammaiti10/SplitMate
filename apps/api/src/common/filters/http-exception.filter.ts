import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string | string[];
  timestamp: string;
  path?: string;
  validationErrors?: Record<string, string[]>;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message: string | string[] = 'Internal server error';
    let validationErrors: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.getErrorCode(statusCode);
      } else if (typeof exceptionResponse === 'object') {
        const response = exceptionResponse as Record<string, any>;
        message = response.message || exception.message;
        code = response.error || this.getErrorCode(statusCode);

        if (Array.isArray(message) && statusCode === HttpStatus.BAD_REQUEST) {
          validationErrors = this.mapValidationErrors(message as string[]);
        }
      }
    } else if (exception instanceof Error) {
      message =
        process.env.NODE_ENV === 'development'
          ? exception.message
          : 'Internal server error';
      code = 'INTERNAL_SERVER_ERROR';
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (validationErrors) {
      errorResponse.validationErrors = validationErrors;
    }

    response.status(statusCode).json(errorResponse);
  }

  private getErrorCode(statusCode: number): string {
    const codeMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codeMap[statusCode] || 'ERROR';
  }

  private mapValidationErrors(messages: string[]): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    for (const message of messages) {
      const match = message.match(/^(\w+)\s/);
      const field = match ? match[1] : 'unknown';
      if (!errors[field]) {
        errors[field] = [];
      }
      errors[field].push(message);
    }
    return errors;
  }
}
