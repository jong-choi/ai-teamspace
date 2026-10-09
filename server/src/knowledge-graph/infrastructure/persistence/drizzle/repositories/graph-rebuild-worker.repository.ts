import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import {
  type GraphRebuildKind,
  type GraphRebuildPosition,
  isGraphRebuildTerminal,
  type RebuildClaim,
  RebuildClaimSchema,
  type RebuildOutcome,
} from '@/knowledge-graph/domain/graph-rebuild';
import { graphRebuildRequest } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.schema';
import { GraphRebuildWorkerRepository } from '@/knowledge-graph/infrastructure/persistence/graph-rebuild-request.repository';
import { SemanticRefreshService } from '@/knowledge-graph/semantic-refresh.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';

import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

type OwnerTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

const ACTIVE_STATUSES = [
  'accepted',
  'running',
  'catching_up',
  'cancel_requested',
] as const;

function toRebuildClaim(row: typeof graphRebuildRequest.$inferSelect) {
  return RebuildClaimSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    requestedByUserId: row.requestedByUserId,
    mode: row.mode,
    status: row.status,
    phase: row.phase,
    cursorKind: row.cursorKind,
    cursorAfterId: row.cursorAfterId,
    leaseToken: row.leaseToken,
    leaseExpiresAt: row.leaseExpiresAt,
    fenceToken: row.fenceToken,
    catchUpStartedAt: row.catchUpStartedAt,
  });
}

@Injectable()
export class GraphRebuildWorkerDrizzleRepository extends GraphRebuildWorkerRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly publisher: OutboxAggregateChangePublisher,
    private readonly semantic: SemanticRefreshService,
  ) {
    super();
  }

  claim(requestId: string) {
    return this.database.runInTransaction(async () => {
      const transaction = this.database.requireTransaction();
      const [current] = await transaction
        .select()
        .from(graphRebuildRequest)
        .where(eq(graphRebuildRequest.id, requestId))
        .for('update')
        .limit(1);
      if (!current) return 'missing' as const;
      if (isGraphRebuildTerminal(current.status)) return 'terminal' as const;
      if (
        current.leaseToken &&
        current.leaseExpiresAt &&
        current.leaseExpiresAt.getTime() > Date.now()
      ) {
        return 'busy' as const;
      }

      const leaseToken = randomUUID();
      const [claimed] = await transaction
        .update(graphRebuildRequest)
        .set({
          status: current.status === 'accepted' ? 'running' : current.status,
          startedAt: current.startedAt ?? sql`clock_timestamp()`,
          leaseToken,
          leaseExpiresAt: sql`clock_timestamp() + interval '2 minutes'`,
          fenceToken: sql`${graphRebuildRequest.fenceToken} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(graphRebuildRequest.id, requestId))
        .returning();
      if (!claimed) throw new Error('GRAPH_REBUILD_CLAIM_MISSING');
      return toRebuildClaim(claimed);
    });
  }

  commitProjectionPage(
    claim: RebuildClaim,
    kind: GraphRebuildKind,
    ids: readonly string[],
  ) {
    return this.database.runInTransaction(async () => {
      const transaction = this.database.requireTransaction();
      if (!(await this.lockClaim(transaction, claim))) return false;

      let intents = 0;
      let skippedDeleted = 0;
      for (const id of ids) {
        const recorded = await this.publisher.recordOperatorIntent(
          transaction,
          claim.organizationId,
          kind,
          id,
        );
        if (recorded) intents += 1;
        else skippedDeleted += 1;
      }

      const [updated] = await transaction
        .update(graphRebuildRequest)
        .set({
          cursorKind: kind,
          cursorAfterId: ids.at(-1) ?? claim.cursorAfterId,
          pagesCommitted: sql`${graphRebuildRequest.pagesCommitted} + 1`,
          projectionIntents: sql`${graphRebuildRequest.projectionIntents} + ${intents}`,
          skippedDeleted: sql`${graphRebuildRequest.skippedDeleted} + ${skippedDeleted}`,
          updatedAt: sql`now()`,
        })
        .where(this.claimCondition(claim))
        .returning({ id: graphRebuildRequest.id });
      return Boolean(updated);
    });
  }

  commitSemanticPage(claim: RebuildClaim, ids: readonly string[]) {
    return this.database.runInTransaction(async () => {
      const transaction = this.database.requireTransaction();
      if (!(await this.lockClaim(transaction, claim))) return false;
      if (!claim.requestedByUserId) return false;

      let requests = 0;
      let skippedDeleted = 0;
      for (const id of ids) {
        const accepted = await this.semantic.requestManualRefreshInTransaction(
          claim.organizationId,
          id,
          claim.requestedByUserId,
        );
        if (accepted.outcome === 'accepted') {
          requests += accepted.coalesced ? 0 : 1;
        } else {
          skippedDeleted += 1;
        }
      }

      const [updated] = await transaction
        .update(graphRebuildRequest)
        .set({
          cursorKind: 'wiki_document',
          cursorAfterId: ids.at(-1) ?? claim.cursorAfterId,
          pagesCommitted: sql`${graphRebuildRequest.pagesCommitted} + 1`,
          semanticRequests: sql`${graphRebuildRequest.semanticRequests} + ${requests}`,
          skippedDeleted: sql`${graphRebuildRequest.skippedDeleted} + ${skippedDeleted}`,
          updatedAt: sql`now()`,
        })
        .where(this.claimCondition(claim))
        .returning({ id: graphRebuildRequest.id });
      return Boolean(updated);
    });
  }

  advance(claim: RebuildClaim, next: GraphRebuildPosition) {
    return this.database.runInTransaction(async () => {
      const transaction = this.database.requireTransaction();
      if (!(await this.lockClaim(transaction, claim))) return null;
      const [updated] = await transaction
        .update(graphRebuildRequest)
        .set({
          phase: next.phase,
          cursorKind: next.kind,
          cursorAfterId: next.afterId,
          updatedAt: sql`now()`,
        })
        .where(this.claimCondition(claim))
        .returning();
      return updated ? toRebuildClaim(updated) : null;
    });
  }

  heartbeat(claim: RebuildClaim) {
    return this.database.runInTransaction(async () => {
      const transaction = this.database.requireTransaction();
      if (!(await this.lockClaim(transaction, claim))) return null;
      const [updated] = await transaction
        .update(graphRebuildRequest)
        .set({
          leaseExpiresAt: sql`clock_timestamp() + interval '2 minutes'`,
          updatedAt: sql`now()`,
        })
        .where(this.claimCondition(claim))
        .returning();
      return updated ? toRebuildClaim(updated) : null;
    });
  }

  release(claim: RebuildClaim) {
    return this.database.runInTransaction(async () => {
      const transaction = this.database.requireTransaction();
      if (!(await this.lockClaim(transaction, claim))) return false;
      const [updated] = await transaction
        .update(graphRebuildRequest)
        .set({
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: sql`now()`,
        })
        .where(this.claimCondition(claim))
        .returning({ id: graphRebuildRequest.id });
      return Boolean(updated);
    });
  }

  startCatchUp(claim: RebuildClaim) {
    return this.database.runInTransaction(async () => {
      const transaction = this.database.requireTransaction();
      if (!(await this.lockClaim(transaction, claim))) return null;
      const [updated] = await transaction
        .update(graphRebuildRequest)
        .set({
          status: 'catching_up',
          catchUpStartedAt: sql`coalesce(${graphRebuildRequest.catchUpStartedAt}, clock_timestamp())`,
          cursorKind: null,
          cursorAfterId: null,
          updatedAt: sql`now()`,
        })
        .where(this.claimCondition(claim))
        .returning();
      return updated ? toRebuildClaim(updated) : null;
    });
  }

  finish(claim: RebuildClaim, outcome: RebuildOutcome) {
    return this.database.runInTransaction(async () => {
      const transaction = this.database.requireTransaction();
      if (!(await this.lockClaim(transaction, claim))) return false;
      const failed = outcome.status === 'failed';
      const [updated] = await transaction
        .update(graphRebuildRequest)
        .set({
          status: outcome.status,
          failedSources: failed ? outcome.failedSources : null,
          lastErrorCode: failed ? outcome.errorCode : null,
          completedAt: sql`clock_timestamp()`,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: sql`now()`,
        })
        .where(this.claimCondition(claim))
        .returning({ id: graphRebuildRequest.id });
      return Boolean(updated);
    });
  }

  async listRedeliverable(limit: number) {
    const rows = await this.database.db
      .select({ id: graphRebuildRequest.id })
      .from(graphRebuildRequest)
      .where(
        and(
          inArray(graphRebuildRequest.status, [...ACTIVE_STATUSES]),
          or(
            isNull(graphRebuildRequest.leaseExpiresAt),
            lt(graphRebuildRequest.leaseExpiresAt, sql`clock_timestamp()`),
          ),
        ),
      )
      .orderBy(asc(graphRebuildRequest.updatedAt), asc(graphRebuildRequest.id))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  private async lockClaim(
    transaction: OwnerTransaction,
    claim: RebuildClaim,
  ): Promise<boolean> {
    const [row] = await transaction
      .select({ id: graphRebuildRequest.id })
      .from(graphRebuildRequest)
      .where(this.claimCondition(claim))
      .for('update')
      .limit(1);
    return Boolean(row);
  }

  private claimCondition(claim: RebuildClaim) {
    return and(
      eq(graphRebuildRequest.id, claim.id),
      eq(graphRebuildRequest.leaseToken, claim.leaseToken),
      eq(graphRebuildRequest.fenceToken, claim.fenceToken),
      sql`${graphRebuildRequest.leaseExpiresAt} > clock_timestamp()`,
    );
  }
}
