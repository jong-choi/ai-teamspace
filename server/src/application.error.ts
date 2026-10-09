export type ApplicationErrorKind =
  | 'bad_request'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'external_provider'
  | 'internal';

type ApplicationErrorOptions = ErrorOptions & {
  retryAfterSeconds?: number;
};

export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly kind: ApplicationErrorKind,
    message: string,
    options?: ApplicationErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }

  readonly retryAfterSeconds: number | undefined;
}
