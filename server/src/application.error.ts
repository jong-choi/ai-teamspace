export type ApplicationErrorKind =
  | 'bad_request'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'external_provider'
  | 'internal';

export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly kind: ApplicationErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}
