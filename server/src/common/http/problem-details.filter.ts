import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import {
  ApplicationError,
  type ApplicationErrorKind,
} from '@/application.error';

import {
  HTTP_EXCEPTION_FILTER_KEY,
  HttpExceptionFilter,
} from 'nest-problem-details-filter';

const statusByKind = {
  bad_request: HttpStatus.BAD_REQUEST,
  conflict: HttpStatus.CONFLICT,
  external_provider: HttpStatus.BAD_GATEWAY,
  forbidden: HttpStatus.FORBIDDEN,
  internal: HttpStatus.INTERNAL_SERVER_ERROR,
  not_found: HttpStatus.NOT_FOUND,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
} as const satisfies Record<ApplicationErrorKind, number>;

@Catch()
@Injectable()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(
    @Inject(HTTP_EXCEPTION_FILTER_KEY)
    private readonly httpExceptionFilter: HttpExceptionFilter,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    this.httpExceptionFilter.catch(this.normalize(exception, host), host);
  }

  private normalize(exception: unknown, host: ArgumentsHost): HttpException {
    if (exception instanceof HttpException) return exception;

    if (exception instanceof ApplicationError) {
      const status = statusByKind[exception.kind];
      if (exception.retryAfterSeconds !== undefined) {
        this.httpAdapterHost.httpAdapter.setHeader(
          host.switchToHttp().getResponse(),
          'Retry-After',
          String(Math.max(1, Math.ceil(exception.retryAfterSeconds))),
        );
      }
      if (status >= 500) {
        this.logFailure(exception.code, status, exception.cause, host);
      }
      return new HttpException(exception.message, status, {
        cause: exception,
        errorCode: exception.code,
      });
    }

    if (isExposedClientHttpError(exception)) {
      return new HttpException(exception.message, exception.status, {
        cause: exception,
      });
    }

    this.logFailure(
      'INTERNAL_SERVER_ERROR',
      HttpStatus.INTERNAL_SERVER_ERROR,
      exception,
      host,
    );
    return new HttpException(
      'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
      { cause: exception },
    );
  }

  private logFailure(
    code: string,
    status: number,
    cause: unknown,
    host: ArgumentsHost,
  ): void {
    const request = host.switchToHttp().getRequest<{ method?: string }>();
    this.logger.error({
      code,
      status,
      operation: request.method,
      cause: cause instanceof Error ? cause.name : 'UnknownError',
    });
  }
}

/**
 * body-parser 등 Express middleware가 던지는 `http-errors` 형식의 4xx 오류다.
 * `expose: true`는 메시지를 client에 노출해도 된다는 표시이므로 원래 status를 유지한다.
 */
function isExposedClientHttpError(
  exception: unknown,
): exception is Error & { status: number } {
  return (
    exception instanceof Error &&
    'expose' in exception &&
    exception.expose === true &&
    'status' in exception &&
    typeof exception.status === 'number' &&
    exception.status >= 400 &&
    exception.status < 500
  );
}
