/** Agent runtime production driver 설정이 유효하지 않을 때 발생한다. */
export class RuntimeConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RuntimeConfigError';
  }
}
