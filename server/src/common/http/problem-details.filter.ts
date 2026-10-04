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

import {
  ApplicationError,
  type ApplicationErrorKind,
} from '#server/application.error.js';

import {
  HTTP_EXCEPTION_FILTER_KEY,
  HttpExceptionFilter,
} from 'nest-problem-details-filter';

const statusByKind = {
  bad_request: HttpStatus.BAD_REQUEST,
  conflict: HttpStatus.CONFLICT,
  external_provider: HttpStatus.BAD_GATEWAY,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
} as const satisfies Record<ApplicationErrorKind, number>;

@Catch()
@Injectable()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(
    @Inject(HTTP_EXCEPTION_FILTER_KEY)
    private readonly httpExceptionFilter: HttpExceptionFilter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    this.httpExceptionFilter.catch(this.normalize(exception, host), host);
  }

  private normalize(exception: unknown, host: ArgumentsHost): HttpException {
    if (exception instanceof HttpException) return exception;

    if (exception instanceof ApplicationError) {
      const status = statusByKind[exception.kind];
      if (status >= 500) {
        this.logFailure(exception.code, status, exception.cause, host);
      }
      return new HttpException(exception.message, status, {
        cause: exception,
        errorCode: exception.code,
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
