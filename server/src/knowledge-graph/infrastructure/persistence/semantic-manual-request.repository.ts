import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';
import type { OutboxSemanticManualRequest } from '@/outbox/outbox-semantic-manual-request';

export abstract class SemanticManualRequestRepository {
  abstract request(
    scope: SemanticSourceScope,
    actorUserId: string,
  ): ReturnType<OutboxSemanticManualRequest['request']>;
  abstract requestInTransaction(
    scope: SemanticSourceScope,
    actorUserId: string,
  ): ReturnType<OutboxSemanticManualRequest['requestInTransaction']>;
  abstract markDelivered(
    scope: SemanticSourceScope,
    manualRequestSeq: number,
  ): Promise<void>;
}
