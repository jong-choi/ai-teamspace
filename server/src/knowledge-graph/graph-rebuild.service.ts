import { Injectable } from '@nestjs/common';

import {
  KnowledgeGraphRebuildForbiddenError,
  KnowledgeGraphRebuildNotCancellableError,
  KnowledgeGraphRebuildNotFoundError,
} from '@/knowledge-graph/domain/graph-rebuild.error';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import type {
  GraphRebuildCreate,
  GraphRebuildListQuery,
} from '@/knowledge-graph/dto/graph-rebuild.dto';
import { GraphCompletenessService } from '@/knowledge-graph/graph-completeness.service';
import { GraphOperationsRepository } from '@/knowledge-graph/infrastructure/persistence/graph-operations.repository';
import { GraphRebuildRequestRepository } from '@/knowledge-graph/infrastructure/persistence/graph-rebuild-request.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';

const ageSeconds = (at: Date | null): number | null =>
  at ? Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000)) : null;

@Injectable()
export class GraphRebuildService {
  constructor(
    private readonly requests: GraphRebuildRequestRepository,
    private readonly access: GraphSourceAccessProvider,
    private readonly completeness: GraphCompletenessService,
    private readonly projectionState: OutboxAggregateProjectionState,
    private readonly semanticRecovery: OutboxSemanticRecovery,
    private readonly operations: GraphOperationsRepository,
  ) {}

  async request(
    actor: OrganizationActorContext,
    organizationId: string,
    input: GraphRebuildCreate,
  ) {
    const result = await this.requests.request(
      organizationId,
      actor.userId,
      input.mode,
    );
    if (result.outcome === 'forbidden')
      throw new KnowledgeGraphRebuildForbiddenError();
    return {
      requestId: result.acceptance.id,
      status: result.acceptance.status,
      mode: result.acceptance.mode,
      acceptedAt: result.acceptance.acceptedAt.toISOString(),
      coalesced: result.acceptance.coalesced,
    };
  }

  async get(
    actor: OrganizationActorContext,
    organizationId: string,
    requestId: string,
  ) {
    await this.assertAdministrator(actor, organizationId);
    const request = await this.requests.get(organizationId, requestId);
    if (!request) throw new KnowledgeGraphRebuildNotFoundError();
    return this.toProgress(request);
  }

  async list(
    actor: OrganizationActorContext,
    organizationId: string,
    query: GraphRebuildListQuery,
  ) {
    await this.assertAdministrator(actor, organizationId);
    return {
      items: (await this.requests.listRecent(organizationId, query.limit)).map(
        (request) => this.toProgress(request),
      ),
    };
  }

  async cancel(
    actor: OrganizationActorContext,
    organizationId: string,
    requestId: string,
  ) {
    const result = await this.requests.cancel(
      organizationId,
      actor.userId,
      requestId,
    );
    if (result.outcome === 'forbidden')
      throw new KnowledgeGraphRebuildForbiddenError();
    if (result.outcome === 'not_found')
      throw new KnowledgeGraphRebuildNotFoundError();
    if (result.outcome === 'not_cancellable')
      throw new KnowledgeGraphRebuildNotCancellableError();
    return {
      requestId: result.request.id,
      status: result.request.status,
    };
  }

  async status(actor: OrganizationActorContext, organizationId: string) {
    await this.assertAdministrator(actor, organizationId);

    const [completeness, active, projection, semantic, quota] =
      await Promise.all([
        this.completeness.forOrganization(organizationId),
        this.requests.active(organizationId),
        this.projectionState.organizationProgress(organizationId, []),
        this.semanticRecovery.organizationStats(
          organizationId,
          semanticPipelineFingerprint,
        ),
        this.operations.quotaUsage(organizationId),
      ]);

    return {
      completeness,
      activeRebuild: active
        ? {
            requestId: active.id,
            mode: active.mode,
            status: active.status,
          }
        : null,
      projection: {
        pending: projection.pending,
        failed: projection.failed,
        oldestPendingAgeSeconds: ageSeconds(projection.oldestPendingAt),
      },
      semantic: {
        notIndexed: semantic.notIndexed,
        waiting: semantic.waiting,
        accepted: semantic.accepted,
        queued: semantic.queued,
        running: semantic.running,
        stale: semantic.stale,
        failed: semantic.failed,
        upToDate: semantic.upToDate,
        oldestAcceptedAgeSeconds: ageSeconds(semantic.oldestAcceptedAt),
      },
      quota,
    };
  }

  private async assertAdministrator(
    actor: OrganizationActorContext,
    organizationId: string,
  ): Promise<void> {
    if (!(await this.access.isAdministrator(actor, organizationId)))
      throw new KnowledgeGraphRebuildForbiddenError();
  }

  private toProgress(
    request: Awaited<ReturnType<GraphRebuildRequestRepository['get']>> & object,
  ) {
    return {
      requestId: request.id,
      mode: request.mode,
      status: request.status,
      phase: request.phase,
      pagesCommitted: request.pagesCommitted,
      projectionIntents: request.projectionIntents,
      semanticRequests: request.semanticRequests,
      skippedDeleted: request.skippedDeleted,
      failedSources: request.failedSources,
      lastErrorCode: request.lastErrorCode,
      acceptedAt: request.acceptedAt.toISOString(),
      startedAt: request.startedAt?.toISOString() ?? null,
      completedAt: request.completedAt?.toISOString() ?? null,
    };
  }
}
