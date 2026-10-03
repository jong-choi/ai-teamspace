import { HttpStatus, Logger } from '@nestjs/common';

import { ApplicationError } from '#server/application.error.js';

import type { Rfc9457ModuleOptions } from '@camcima/nestjs-rfc9457';

const statusByKind = {
  bad_request: HttpStatus.BAD_REQUEST,
  conflict: HttpStatus.CONFLICT,
  external_provider: HttpStatus.BAD_GATEWAY,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
} as const satisfies Record<ApplicationError['kind'], number>;
const logger = new Logger('ProblemDetails');

export const problemDetailsOptions = {
  catchAllExceptions: true,
  suppress5xxDetail: true,
  instanceStrategy: 'request-uri',
  exceptionMapper(exception, request) {
    if (!(exception instanceof ApplicationError)) return null;
    const status = statusByKind[exception.kind];
    if (status >= 500) {
      logger.error({
        code: exception.code,
        status,
        operation: request.method,
        cause:
          exception.cause instanceof Error ? exception.cause.name : undefined,
      });
    }
    return { status, detail: exception.message, code: exception.code };
  },
  onUnhandled(exception, request, problem) {
    logger.error({
      code: 'INTERNAL_SERVER_ERROR',
      status: problem.status,
      operation: request.method,
      cause: exception instanceof Error ? exception.name : 'UnknownError',
    });
  },
} satisfies Rfc9457ModuleOptions;
