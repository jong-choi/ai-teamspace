import { Injectable, Logger } from '@nestjs/common';

import type {
  GraphRebuildKind,
  RebuildClaim,
} from '@/knowledge-graph/domain/graph-rebuild';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { GraphRebuildWorkerRepository } from '@/knowledge-graph/infrastructure/persistence/graph-rebuild-request.repository';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';

const PROJECTION_KINDS: readonly GraphRebuildKind[] = [
  'wiki_document',
  'project',
  'ticket_label',
  'ticket',
  'meeting',
  'meeting_room',
  'meeting_recurrence',
  'membership',
  'curated_node',
  'curated_edge',
];
const PROJECTION_PAGE_SIZE = 100;
const SEMANTIC_PAGE_SIZE = 50;
const RUN_BUDGET_MS = 90_000;
const CATCH_UP_TIMEOUT_MS = 30 * 60_000;
const CATCH_UP_RETRY_MS = 30_000;

export type GraphRebuildWorkflowResult =
  { kind: 'done' } | { kind: 'busy' } | { kind: 'delay'; delayMs: number };

@Injectable()
export class GraphRebuildWorkflowService {
  private readonly logger = new Logger(GraphRebuildWorkflowService.name);

  constructor(
    private readonly repository: GraphRebuildWorkerRepository,
    private readonly sources: WorkosSourceProvider,
    private readonly access: GraphSourceAccessProvider,
    private readonly projectionState: OutboxAggregateProjectionState,
    private readonly semanticRecovery: OutboxSemanticRecovery,
  ) {}

  async run(requestId: string): Promise<GraphRebuildWorkflowResult> {
    const claimed = await this.repository.claim(requestId);
    if (claimed === 'missing' || claimed === 'terminal') {
      return { kind: 'done' };
    }
    if (claimed === 'busy') return { kind: 'busy' };

    let claim = claimed;
    if (claim.status === 'cancel_requested') {
      await this.repository.finish(claim, { status: 'cancelled' });
      return { kind: 'done' };
    }
    if (!(await this.sources.organizationExists(claim.organizationId))) {
      await this.repository.finish(claim, {
        status: 'failed',
        errorCode: 'REBUILD_ORGANIZATION_MISSING',
        failedSources: null,
      });
      return { kind: 'done' };
    }
    if (
      !claim.requestedByUserId ||
      !(await this.access.isAdministrator(
        { userId: claim.requestedByUserId },
        claim.organizationId,
      ))
    ) {
      await this.repository.finish(claim, {
        status: 'failed',
        errorCode: 'REBUILD_REQUESTER_FORBIDDEN',
        failedSources: null,
      });
      return { kind: 'done' };
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < RUN_BUDGET_MS) {
      const current = await this.repository.heartbeat(claim);
      if (!current) return { kind: 'done' };
      claim = current;

      if (claim.status === 'cancel_requested') {
        await this.repository.finish(claim, { status: 'cancelled' });
        return { kind: 'done' };
      }

      if (claim.status === 'catching_up') {
        return this.catchUp(claim);
      }

      if (claim.phase === 'projection') {
        const result = await this.processProjectionPage(claim);
        if (result.kind === 'done') return result;
        claim = result.claim;
        continue;
      }

      if (claim.phase === 'semantic') {
        const result = await this.processSemanticPage(claim);
        if (result.kind === 'done') return result;
        claim = result.claim;
        continue;
      }

      const catchUp = await this.repository.startCatchUp(claim);
      if (!catchUp) return { kind: 'done' };
      return this.catchUp(catchUp);
    }

    await this.repository.release(claim);
    return { kind: 'delay', delayMs: 0 };
  }

  private async processProjectionPage(
    claim: RebuildClaim,
  ): Promise<{ kind: 'continue'; claim: RebuildClaim } | { kind: 'done' }> {
    const kind = claim.cursorKind ?? PROJECTION_KINDS[0];
    if (!kind) return { kind: 'done' };

    const page = await this.sources.listIds(
      kind,
      claim.organizationId,
      claim.cursorAfterId,
      PROJECTION_PAGE_SIZE,
    );
    if (page.length > 0) {
      const committed = await this.repository.commitProjectionPage(
        claim,
        kind,
        page.map(({ id }) => id),
      );
      if (!committed) return { kind: 'done' };
      const refreshed = await this.repository.heartbeat(claim);
      if (!refreshed) return { kind: 'done' };
      claim = refreshed;
      if (page.length === PROJECTION_PAGE_SIZE)
        return { kind: 'continue', claim };
    }

    const index = PROJECTION_KINDS.indexOf(kind);
    const nextKind = PROJECTION_KINDS[index + 1];
    if (nextKind) {
      const advanced = await this.repository.advance(claim, {
        phase: 'projection',
        kind: nextKind,
        afterId: null,
      });
      return advanced
        ? { kind: 'continue', claim: advanced }
        : { kind: 'done' };
    }

    if (claim.mode === 'full') {
      const advanced = await this.repository.advance(claim, {
        phase: 'semantic',
        kind: 'wiki_document',
        afterId: null,
      });
      return advanced
        ? { kind: 'continue', claim: advanced }
        : { kind: 'done' };
    }

    const catchUp = await this.repository.startCatchUp(claim);
    return catchUp ? { kind: 'continue', claim: catchUp } : { kind: 'done' };
  }

  private async processSemanticPage(
    claim: RebuildClaim,
  ): Promise<{ kind: 'continue'; claim: RebuildClaim } | { kind: 'done' }> {
    const page = await this.sources.listIds(
      'wiki_document',
      claim.organizationId,
      claim.cursorAfterId,
      SEMANTIC_PAGE_SIZE,
    );
    if (page.length > 0) {
      const committed = await this.repository.commitSemanticPage(
        claim,
        page.map(({ id }) => id),
      );
      if (!committed) return { kind: 'done' };
      const refreshed = await this.repository.heartbeat(claim);
      if (!refreshed) return { kind: 'done' };
      claim = refreshed;
      if (page.length === SEMANTIC_PAGE_SIZE)
        return { kind: 'continue', claim };
    }

    const catchUp = await this.repository.startCatchUp(claim);
    return catchUp ? { kind: 'continue', claim: catchUp } : { kind: 'done' };
  }

  private async catchUp(
    claim: RebuildClaim,
  ): Promise<GraphRebuildWorkflowResult> {
    const projection =
      claim.mode === 'semantic_reindex'
        ? { pending: 0, failed: 0 }
        : await this.projectionState.organizationProgress(
            claim.organizationId,
            PROJECTION_KINDS,
          );
    const semantic =
      claim.mode === 'projection_repair'
        ? { pending: 0, failed: 0 }
        : await this.semanticRecovery.organizationStats(
            claim.organizationId,
            semanticPipelineFingerprint,
          );

    const pending = projection.pending + semantic.pending;
    const failed = projection.failed + semantic.failed;
    if (pending === 0 && failed === 0) {
      await this.repository.finish(claim, { status: 'succeeded' });
      return { kind: 'done' };
    }
    if (failed > 0) {
      await this.repository.finish(claim, {
        status: 'failed',
        errorCode: 'REBUILD_SOURCES_FAILED',
        failedSources: failed,
      });
      return { kind: 'done' };
    }

    const catchUpStartedAt = claim.catchUpStartedAt ?? new Date();
    if (Date.now() - catchUpStartedAt.getTime() >= CATCH_UP_TIMEOUT_MS) {
      await this.repository.finish(claim, {
        status: 'failed',
        errorCode: 'REBUILD_CATCH_UP_TIMEOUT',
        failedSources: pending,
      });
      return { kind: 'done' };
    }

    this.logger.log({
      code: 'KG_REBUILD_CATCH_UP_PENDING',
      requestId: claim.id,
      pending,
    });
    await this.repository.release(claim);
    return { kind: 'delay', delayMs: CATCH_UP_RETRY_MS };
  }
}
