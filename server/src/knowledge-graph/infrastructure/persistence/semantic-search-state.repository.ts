import type { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

export abstract class SemanticSearchStateRepository {
  abstract listSearchableSources(
    organizationId: string,
    fingerprint: string,
    limit: number,
  ): ReturnType<OutboxSemanticSourceState['listSearchableSources']>;

  abstract currentBatch(
    organizationId: string,
    kind: 'wiki_document',
    ids: readonly string[],
  ): ReturnType<OutboxSemanticSourceState['currentBatch']>;
}
