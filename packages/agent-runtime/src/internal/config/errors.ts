// Config loading happens at boot, before any HTTP request exists, so its failures are their
// own kind — a bad `langgraph.json`, a missing graph module, a malformed `path:export` spec.
// `#agent-runtime/internal/config/index.js` sits below `@repo/agent-runtime/core` in the layering, so it does not reach up for
// core's `SkeinHttpError`; it throws this instead and the CLI reports it.

export interface SkeinConfigErrorOptions {
  /** Underlying error (JSON parse failure, import failure, …). */
  cause?: unknown;
  /** Structured detail — e.g. Zod validation issues. */
  details?: unknown;
}

/** A problem loading or validating local agent runtime configuration. */
export class SkeinConfigError extends Error {
  readonly details?: unknown;

  constructor(message: string, options: SkeinConfigErrorOptions = {}) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'SkeinConfigError';
    this.details = options.details;
  }
}
