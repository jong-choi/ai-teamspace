import { Injectable } from '@nestjs/common';

import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

@Injectable()
export class OutboxSemanticSourceStateAdapter extends SemanticSourceStateRepository {
  constructor(private readonly state: OutboxSemanticSourceState) {
    super();
  }
  current(...args: Parameters<SemanticSourceStateRepository['current']>) {
    return this.state.current(...args);
  }
  observeCommitted(
    ...args: Parameters<SemanticSourceStateRepository['observeCommitted']>
  ) {
    return this.state.observeCommitted(...args);
  }
  acquireLease(
    ...args: Parameters<SemanticSourceStateRepository['acquireLease']>
  ) {
    return this.state.acquireLease(...args);
  }
  heartbeat(...args: Parameters<SemanticSourceStateRepository['heartbeat']>) {
    return this.state.heartbeat(...args);
  }
  release(...args: Parameters<SemanticSourceStateRepository['release']>) {
    return this.state.release(...args);
  }
  activate(...args: Parameters<SemanticSourceStateRepository['activate']>) {
    return this.state.activate(...args);
  }
  satisfyWithoutReindex(
    ...args: Parameters<SemanticSourceStateRepository['satisfyWithoutReindex']>
  ) {
    return this.state.satisfyWithoutReindex(...args);
  }
  markRemoved(
    ...args: Parameters<SemanticSourceStateRepository['markRemoved']>
  ) {
    return this.state.markRemoved(...args);
  }
  clearGc(...args: Parameters<SemanticSourceStateRepository['clearGc']>) {
    return this.state.clearGc(...args);
  }
}
