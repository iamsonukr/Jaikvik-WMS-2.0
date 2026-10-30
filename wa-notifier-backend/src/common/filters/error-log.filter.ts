import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ErrorLogsService } from '../../error-logs/error-logs.service';

@Catch()
export class ErrorLogFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly errorLogs: ErrorLogsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const message = exception instanceof Error
      ? exception.message
      : typeof exceptionResponse === 'string'
        ? exceptionResponse
        : 'Internal server error';

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      void this.errorLogs.record({
        message,
        context: 'HTTP request',
        stack: exception instanceof Error ? exception.stack : undefined,
        method: request?.method,
        path: request?.originalUrl || request?.url,
        statusCode: status,
      });
    }

    const body = exception instanceof HttpException
      ? exception.getResponse()
      : { statusCode: status, message: 'Internal server error' };
    httpAdapter.reply(response, body, status);
  }
}
