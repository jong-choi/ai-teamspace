import { Injectable } from '@nestjs/common';

import { SemanticManualRequestRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-manual-request.repository';

@Injectable()
export class SemanticRefreshService {
  constructor(private readonly requests: SemanticManualRequestRepository) {}
  requestManualRefresh(
    organizationId: string,
    documentId: string,
    actorUserId: string,
  ) {
    return this.requests.request(
      {
        organizationId,
        aggregateKind: 'wiki_document',
        aggregateId: documentId,
      },
      actorUserId,
    );
  }
}
