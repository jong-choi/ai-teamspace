import type { SemanticReleaseOutcome } from '@/outbox/domain/semantic-source';

export class SemanticProviderError extends Error {
  constructor(
    readonly code: NonNullable<SemanticReleaseOutcome['lastErrorCode']>,
    readonly retryAfterMs: number | null = null,
    readonly terminal: boolean = false,
    readonly retryable: boolean = isSemanticRetryable(code),
  ) {
    super(code);
    this.name = 'SemanticProviderError';
  }
}

export class SemanticLeaseLostError extends Error {
  constructor() {
    super('SEMANTIC_LEASE_LOST');
    this.name = 'SemanticLeaseLostError';
  }
}

export function isSemanticRetryable(code: SemanticProviderError['code']) {
  return (
    code === 'PROVIDER_UNAVAILABLE' ||
    code === 'PROVIDER_TIMEOUT' ||
    code === 'PROVIDER_RATE_LIMITED' ||
    code === 'GRAPH_STORE_UNAVAILABLE'
  );
}
