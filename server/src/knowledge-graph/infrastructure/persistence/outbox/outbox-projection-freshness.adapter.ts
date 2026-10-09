import { Injectable } from '@nestjs/common';

import {
  ProjectionFreshnessRepository,
  type ProjectionFreshnessSource,
} from '@/knowledge-graph/infrastructure/persistence/projection-freshness.repository';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';

@Injectable()
export class OutboxProjectionFreshnessAdapter extends ProjectionFreshnessRepository {
  constructor(
    private readonly projectionState: OutboxAggregateProjectionState,
  ) {
    super();
  }

  freshnessBatch(
    organizationId: string,
    sources: readonly ProjectionFreshnessSource[],
  ) {
    return this.projectionState.projectionFreshnessBatch(
      organizationId,
      sources.map((source) => ({
        aggregateKind: source.kind,
        aggregateId: source.id,
      })),
    );
  }
}
