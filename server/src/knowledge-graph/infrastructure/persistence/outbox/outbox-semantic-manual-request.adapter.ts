import { Injectable } from '@nestjs/common';

import { SemanticManualRequestRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-manual-request.repository';
import { OutboxSemanticManualRequest } from '@/outbox/outbox-semantic-manual-request';

@Injectable()
export class OutboxSemanticManualRequestAdapter extends SemanticManualRequestRepository {
  constructor(private readonly requests: OutboxSemanticManualRequest) {
    super();
  }
  request(...args: Parameters<SemanticManualRequestRepository['request']>) {
    return this.requests.request(...args);
  }
  markDelivered(
    ...args: Parameters<SemanticManualRequestRepository['markDelivered']>
  ) {
    return this.requests.markDelivered(...args);
  }
}
