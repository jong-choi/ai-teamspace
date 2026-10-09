import type { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';

export abstract class SemanticRecoveryRepository {
  abstract releaseDeliveryFailure(
    ...args: Parameters<OutboxSemanticRecovery['releaseDeliveryFailure']>
  ): ReturnType<OutboxSemanticRecovery['releaseDeliveryFailure']>;
  abstract discoverMissing(
    limit: number,
  ): ReturnType<OutboxSemanticRecovery['discoverMissing']>;
  abstract claimGapBatch(
    limit: number,
    fingerprint: string,
  ): ReturnType<OutboxSemanticRecovery['claimGapBatch']>;
  abstract stats(
    fingerprint: string,
  ): ReturnType<OutboxSemanticRecovery['stats']>;
}
