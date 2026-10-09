import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Outbox } from '@nestjs/outbox';

import { DatabaseService } from '@/database/database.service';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import {
  canCancelGraphRebuild,
  type GraphRebuildMode,
  GraphRebuildRequestSchema,
} from '@/knowledge-graph/domain/graph-rebuild';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { graphRebuildRequest } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.schema';
import { GraphRebuildRequestRepository } from '@/knowledge-graph/infrastructure/persistence/graph-rebuild-request.repository';
import { RequestQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/request-quota.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import {
  GraphRebuildRequestedEventSchema,
  KNOWLEDGE_GRAPH_REBUILD_REQUESTED_TOPIC,
} from '@/outbox/outbox-graph-rebuild-event.schema';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

type OwnerTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

const ACTIVE_STATUSES = [
  'accepted',
  'running',
  'catching_up',
  'cancel_requested',
] as const;

@Injectable()
export class GraphRebuildRequestDrizzleRepository extends GraphRebuildRequestRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: GraphSourceAccessProvider,
    private readonly quota: RequestQuotaRepository,
    private readonly outbox: Outbox<OwnerTransaction>,
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
  ) {
    super();
  }

  request(organizationId: string, actorUserId: string, mode: GraphRebuildMode) {
    return this.database.runInTransaction(async () => {
      if (!(await this.access.lockAdministrator(organizationId, actorUserId))) {
        return { outcome: 'forbidden' as const };
      }

      const transaction = this.database.requireTransaction();
      const active = await this.activeInTransaction(
        transaction,
        organizationId,
      );
      if (active) {
        return {
          outcome: 'accepted' as const,
          acceptance: {
            id: active.id,
            mode: active.mode,
            status: 'accepted' as const,
            acceptedAt: active.acceptedAt,
            coalesced: true,
          },
        };
      }

      const [inserted] = await transaction
        .insert(graphRebuildRequest)
        .values({
          organizationId,
          requestedByUserId: actorUserId,
          mode,
          pipelineFingerprint: semanticPipelineFingerprint,
          phase: mode === 'semantic_reindex' ? 'semantic' : 'projection',
        })
        .onConflictDoNothing()
        .returning();

      if (!inserted) {
        const raced = await this.activeInTransaction(
          transaction,
          organizationId,
        );
        if (!raced) throw new Error('GRAPH_REBUILD_ACTIVE_REQUEST_MISSING');
        return {
          outcome: 'accepted' as const,
          acceptance: {
            id: raced.id,
            mode: raced.mode,
            status: 'accepted' as const,
            acceptedAt: raced.acceptedAt,
            coalesced: true,
          },
        };
      }

      await this.quota.consume({
        action: 'graph_rebuild',
        organizationId,
        actorUserId,
        policy: {
          windowSeconds: 86_400,
          actorLimit: null,
          organizationLimit: this.config.quota.rebuildOrganizationPerDay,
        },
      });

      await this.outbox.add(transaction, {
        topic: KNOWLEDGE_GRAPH_REBUILD_REQUESTED_TOPIC,
        key: JSON.stringify(['graph_rebuild', organizationId]),
        payload: GraphRebuildRequestedEventSchema.parse({
          organizationId,
          requestId: inserted.id,
          occurredAt: new Date().toISOString(),
        }),
      });

      return {
        outcome: 'accepted' as const,
        acceptance: {
          id: inserted.id,
          mode: inserted.mode,
          status: 'accepted' as const,
          acceptedAt: inserted.acceptedAt,
          coalesced: false,
        },
      };
    });
  }

  cancel(organizationId: string, actorUserId: string, requestId: string) {
    return this.database.runInTransaction(async () => {
      if (!(await this.access.lockAdministrator(organizationId, actorUserId))) {
        return { outcome: 'forbidden' as const };
      }

      const transaction = this.database.requireTransaction();
      const [current] = await transaction
        .select()
        .from(graphRebuildRequest)
        .where(
          and(
            eq(graphRebuildRequest.organizationId, organizationId),
            eq(graphRebuildRequest.id, requestId),
          ),
        )
        .for('update')
        .limit(1);
      if (!current) return { outcome: 'not_found' as const };
      if (!canCancelGraphRebuild(current.status)) {
        return { outcome: 'not_cancellable' as const };
      }

      const [updated] = await transaction
        .update(graphRebuildRequest)
        .set({
          status: 'cancel_requested',
          cancelRequestedAt: sql`clock_timestamp()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(graphRebuildRequest.organizationId, organizationId),
            eq(graphRebuildRequest.id, requestId),
          ),
        )
        .returning();
      if (!updated) throw new Error('GRAPH_REBUILD_CANCEL_UPDATE_MISSING');
      return {
        outcome: 'cancelled' as const,
        request: GraphRebuildRequestSchema.parse(updated),
      };
    });
  }

  async get(organizationId: string, requestId: string) {
    const [row] = await this.database.db
      .select()
      .from(graphRebuildRequest)
      .where(
        and(
          eq(graphRebuildRequest.organizationId, organizationId),
          eq(graphRebuildRequest.id, requestId),
        ),
      )
      .limit(1);
    return row ? GraphRebuildRequestSchema.parse(row) : null;
  }

  async listRecent(organizationId: string, limit: number) {
    const rows = await this.database.db
      .select()
      .from(graphRebuildRequest)
      .where(eq(graphRebuildRequest.organizationId, organizationId))
      .orderBy(
        desc(graphRebuildRequest.acceptedAt),
        desc(graphRebuildRequest.id),
      )
      .limit(limit);
    return GraphRebuildRequestSchema.array().parse(rows);
  }

  async latest(organizationId: string) {
    const rows = await this.listRecent(organizationId, 1);
    return rows[0] ?? null;
  }

  async active(organizationId: string) {
    const [row] = await this.database.db
      .select()
      .from(graphRebuildRequest)
      .where(
        and(
          eq(graphRebuildRequest.organizationId, organizationId),
          inArray(graphRebuildRequest.status, [...ACTIVE_STATUSES]),
        ),
      )
      .orderBy(desc(graphRebuildRequest.acceptedAt))
      .limit(1);
    return row ? GraphRebuildRequestSchema.parse(row) : null;
  }

  private async activeInTransaction(
    transaction: OwnerTransaction,
    organizationId: string,
  ) {
    const [row] = await transaction
      .select()
      .from(graphRebuildRequest)
      .where(
        and(
          eq(graphRebuildRequest.organizationId, organizationId),
          inArray(graphRebuildRequest.status, [...ACTIVE_STATUSES]),
        ),
      )
      .orderBy(asc(graphRebuildRequest.acceptedAt))
      .for('update')
      .limit(1);
    return row ? GraphRebuildRequestSchema.parse(row) : null;
  }
}
