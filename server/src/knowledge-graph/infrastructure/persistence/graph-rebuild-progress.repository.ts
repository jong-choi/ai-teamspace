import type { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import type { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';

export abstract class GraphRebuildProgressRepository {
  abstract projection(
    ...args: Parameters<OutboxAggregateProjectionState['organizationProgress']>
  ): ReturnType<OutboxAggregateProjectionState['organizationProgress']>;
  abstract semantic(
    ...args: Parameters<OutboxSemanticRecovery['organizationStats']>
  ): ReturnType<OutboxSemanticRecovery['organizationStats']>;
}
