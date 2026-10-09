import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

export abstract class SemanticJobQueueProvider {
  abstract auto(
    scope: SemanticSourceScope,
    delayMs: number,
    signal?: AbortSignal,
  ): Promise<void>;
  abstract manual(
    scope: SemanticSourceScope,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  abstract remove(
    scope: SemanticSourceScope,
    desiredSeq: number,
    signal?: AbortSignal,
  ): Promise<void>;
}
