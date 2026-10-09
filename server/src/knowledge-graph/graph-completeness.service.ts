import { Injectable } from '@nestjs/common';

import {
  deriveGraphCompleteness,
  type GraphCompleteness,
} from '@/knowledge-graph/domain/graph-completeness';
import { GraphRebuildRequestRepository } from '@/knowledge-graph/infrastructure/persistence/graph-rebuild-request.repository';

@Injectable()
export class GraphCompletenessService {
  constructor(
    private readonly rebuildRequests: GraphRebuildRequestRepository,
  ) {}

  async forOrganization(organizationId: string): Promise<GraphCompleteness> {
    return deriveGraphCompleteness(
      await this.rebuildRequests.latest(organizationId),
    );
  }
}
