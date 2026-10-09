import { Injectable } from '@nestjs/common';

import { SEMANTIC_QUIET_MS } from '@/knowledge-graph/domain/semantic-timing';
import { SemanticManualRequestRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-manual-request.repository';
import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

@Injectable()
export class SemanticDeliveryService {
  constructor(
    private readonly state: SemanticSourceStateRepository,
    private readonly manual: SemanticManualRequestRepository,
  ) {}
  async observeCommitted(scope: SemanticSourceScope, sourceVersion: number) {
    const observed = await this.state.observeCommitted(scope, sourceVersion);
    if (observed.kind !== 'observed') return { kind: observed.kind } as const;
    if (!observed.observedAt) throw new Error('SEMANTIC_OBSERVATION_MISSING');
    return {
      kind: 'observed',
      delayMs: Math.max(
        0,
        observed.observedAt.getTime() +
          SEMANTIC_QUIET_MS -
          observed.dbNow.getTime(),
      ),
    } as const;
  }
  markManualDelivered(scope: SemanticSourceScope, manualRequestSeq: number) {
    return this.manual.markDelivered(scope, manualRequestSeq);
  }
}
