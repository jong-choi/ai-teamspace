import { Injectable } from '@nestjs/common';

import { SemanticSearchStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-search-state.repository';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

@Injectable()
export class OutboxSemanticSearchStateAdapter extends SemanticSearchStateRepository {
  constructor(private readonly state: OutboxSemanticSourceState) {
    super();
  }

  listSearchableSources(
    ...args: Parameters<SemanticSearchStateRepository['listSearchableSources']>
  ) {
    return this.state.listSearchableSources(...args);
  }

  currentBatch(
    ...args: Parameters<SemanticSearchStateRepository['currentBatch']>
  ) {
    return this.state.currentBatch(...args);
  }
}
