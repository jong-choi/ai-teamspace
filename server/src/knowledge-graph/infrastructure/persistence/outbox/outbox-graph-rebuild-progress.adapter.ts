import { Injectable } from '@nestjs/common';

import { GraphRebuildProgressRepository } from '@/knowledge-graph/infrastructure/persistence/graph-rebuild-progress.repository';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';

@Injectable()
export class OutboxGraphRebuildProgressAdapter extends GraphRebuildProgressRepository {
  constructor(
    private readonly projectionState: OutboxAggregateProjectionState,
    private readonly semanticRecovery: OutboxSemanticRecovery,
  ) {
    super();
  }

  projection(
    ...args: Parameters<GraphRebuildProgressRepository['projection']>
  ) {
    return this.projectionState.organizationProgress(...args);
  }

  semantic(...args: Parameters<GraphRebuildProgressRepository['semantic']>) {
    return this.semanticRecovery.organizationStats(...args);
  }
}
