import { Logger as NestLogger, type LoggerService } from '@nestjs/common';

import {
  isRunFailureReport,
  type Logger,
} from '@repo/agent-runtime/agent-protocol';
import {
  describeError,
  formatLogMeta,
  runFailureIdentity,
} from '@repo/agent-runtime/server-kit';

const DEFAULT_CONTEXT = 'AgentRuntime';

export interface NestLoggerOptions {
  context?: string;
  logger?: LoggerService;
}

/** Agent runtime 로그를 호스트 Nest logger로 전달한다. */
export function createNestLogger(options: NestLoggerOptions = {}): Logger {
  const context = options.context ?? DEFAULT_CONTEXT;
  const target = options.logger ?? new NestLogger();

  const withMeta = (message: string, meta: unknown): string => {
    const rendered = formatLogMeta(meta);
    return rendered ? `${message}\n${rendered}` : message;
  };

  return {
    debug: (message, meta) => {
      const text = withMeta(message, meta);
      if (target.debug) target.debug(text, context);
      else target.log(text, context);
    },
    info: (message, meta) => target.log(withMeta(message, meta), context),
    warn: (message, meta) => target.warn(withMeta(message, meta), context),
    error: (message, meta) => {
      if (isRunFailureReport(meta)) {
        target.error(
          `${message}\n${runFailureIdentity(meta)}`,
          describeError(meta.error),
          context,
        );
        return;
      }
      if (meta instanceof Error) {
        target.error(message, describeError(meta), context);
        return;
      }
      target.error(withMeta(message, meta), undefined, context);
    },
  };
}
