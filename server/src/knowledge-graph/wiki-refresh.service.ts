import { Injectable } from '@nestjs/common';

import { ApplicationError } from '@/application.error';
import {
  KnowledgeGraphRefreshAcceptanceUnavailableError,
  KnowledgeGraphWikiDocumentNotFoundError,
  KnowledgeGraphWikiRefreshForbiddenError,
} from '@/knowledge-graph/domain/graph-query.error';
import type { RefreshKnowledgeGraphAccepted } from '@/knowledge-graph/dto/wiki-knowledge-graph.dto';
import { RefreshKnowledgeGraphAcceptedSchema } from '@/knowledge-graph/dto/wiki-knowledge-graph.dto';
import { WikiRefreshAcceptanceRepository } from '@/knowledge-graph/infrastructure/persistence/wiki-refresh-acceptance.repository';

@Injectable()
export class WikiRefreshService {
  constructor(private readonly acceptances: WikiRefreshAcceptanceRepository) {}

  async refresh(
    organizationId: string,
    documentId: string,
    actorUserId: string,
  ): Promise<RefreshKnowledgeGraphAccepted> {
    const accepted = await this.acceptances
      .accept(organizationId, documentId, actorUserId)
      .catch((error: unknown) => {
        if (error instanceof ApplicationError) throw error;
        throw new KnowledgeGraphRefreshAcceptanceUnavailableError({
          cause: error,
        });
      });
    if (accepted.outcome === 'not_found')
      throw new KnowledgeGraphWikiDocumentNotFoundError();
    if (accepted.outcome === 'forbidden')
      throw new KnowledgeGraphWikiRefreshForbiddenError();
    return RefreshKnowledgeGraphAcceptedSchema.parse({
      requestId: accepted.requestId,
      status: 'accepted',
      sourceUpdatedAt: accepted.sourceUpdatedAt.toISOString(),
      acceptedAt: accepted.acceptedAt.toISOString(),
    });
  }
}
