import { Injectable } from '@nestjs/common';

import { ApplicationError } from '@/application.error';
import {
  KnowledgeGraphAuthorizationUnavailableError,
  KnowledgeGraphWikiDocumentNotFoundError,
} from '@/knowledge-graph/domain/graph-query.error';
import { deriveSemanticIndexStatus } from '@/knowledge-graph/domain/semantic-index-status';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import {
  type WikiKnowledgeGraphStatus,
  WikiKnowledgeGraphStatusSchema,
} from '@/knowledge-graph/dto/wiki-knowledge-graph.dto';
import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { WikiProjectionQueryService } from '@/wiki/wiki-projection-query.service';

@Injectable()
export class GraphIndexStatusService {
  constructor(
    private readonly access: GraphSourceAccessProvider,
    private readonly wiki: WikiProjectionQueryService,
    private readonly state: SemanticSourceStateRepository,
  ) {}

  getWikiStatus(
    actor: OrganizationActorContext,
    organizationId: string,
    documentId: string,
  ): Promise<WikiKnowledgeGraphStatus> {
    return this.readWikiStatus(actor, organizationId, documentId).catch(
      (error: unknown) => {
        if (error instanceof ApplicationError) throw error;
        throw new KnowledgeGraphAuthorizationUnavailableError({
          cause: error,
        });
      },
    );
  }

  private async readWikiStatus(
    actor: OrganizationActorContext,
    organizationId: string,
    documentId: string,
  ): Promise<WikiKnowledgeGraphStatus> {
    await this.access.assertReadable(actor, organizationId);
    const owner = await this.wiki.currentSemantic(organizationId, documentId);
    if (!owner) throw new KnowledgeGraphWikiDocumentNotFoundError();
    const scope = {
      organizationId,
      aggregateKind: 'wiki_document' as const,
      aggregateId: documentId,
    };
    let current = await this.state.current(scope);
    let derived = deriveSemanticIndexStatus(
      current,
      owner.updatedAt,
      semanticPipelineFingerprint,
    );
    if (current && !derived) {
      current = await this.state.current(scope);
      derived = deriveSemanticIndexStatus(
        current,
        owner.updatedAt,
        semanticPipelineFingerprint,
      );
      if (!derived) throw new KnowledgeGraphWikiDocumentNotFoundError();
    }
    const state = current?.state ?? null;
    const status = derived?.status ?? 'not_indexed';
    const quietRemainingMs = derived?.quietRemainingMs ?? null;
    return WikiKnowledgeGraphStatusSchema.parse({
      status,
      sourceUpdatedAt: owner.updatedAt.toISOString(),
      indexedSourceUpdatedAt:
        derived?.indexedSourceUpdatedAt?.toISOString() ?? null,
      autoEligibleAt:
        quietRemainingMs === null || !current
          ? null
          : new Date(current.dbNow.getTime() + quietRemainingMs).toISOString(),
      requestId: derived?.requestId ?? null,
      requestedAt: derived?.requestedAt?.toISOString() ?? null,
      latestRequest:
        state?.manualRequestId && state.manualRequestedAt
          ? {
              requestId: state.manualRequestId,
              requestedAt: state.manualRequestedAt.toISOString(),
              satisfied: state.indexedManualSeq >= state.manualRequestSeq,
            }
          : null,
      completedAt: derived?.completedAt?.toISOString() ?? null,
      errorCode: derived?.errorCode ?? null,
    });
  }
}
