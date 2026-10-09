import { Injectable } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';

import { DatabaseService } from '@/database/database.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { semanticSourceKinds } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxAggregateEventSchema } from '@/outbox/outbox-aggregate-event.schema';
import {
  APPLYING_STALL_AFTER_MS,
  REQUEUE_COOLDOWN_BASE_MS,
  REQUEUE_COOLDOWN_MAX_MS,
  RETRY_STALL_AFTER_MS,
} from '@/outbox/outbox-aggregate-recovery.policy';
import { KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC } from '@/outbox/outbox-semantic-event.schema';

import { and, asc, eq, lt, ne, or, sql } from 'drizzle-orm';

export const KNOWLEDGE_GRAPH_OUTBOX_TOPIC = 'kg.business-source-changed.v1';

export type KnowledgeGraphAggregateKind =
  typeof outboxAggregateVersion.$inferSelect.aggregateKind;

type OwnerTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

@Injectable()
export class OutboxAggregateChangePublisher {
  constructor(private readonly outbox: Outbox<OwnerTransaction>) {}

  async wikiChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    documentId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'wiki_document',
      documentId,
      operation,
    );
  }

  async projectChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    projectId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'project',
      projectId,
      operation,
    );
  }

  async ticketChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    ticketId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'ticket',
      ticketId,
      operation,
    );
  }

  async ticketLabelChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    labelId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'ticket_label',
      labelId,
      operation,
    );
  }

  async meetingChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    meetingId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'meeting',
      meetingId,
      operation,
    );
  }

  async membershipChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    userId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'membership',
      userId,
      operation,
    );
  }

  async meetingRoomChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    roomId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'meeting_room',
      roomId,
      operation,
    );
  }
  async meetingRecurrenceChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    seriesId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'meeting_recurrence',
      seriesId,
      operation,
    );
  }

  async curatedNodeChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    nodeId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'curated_node',
      nodeId,
      operation,
    );
  }

  async curatedEdgeChanged(
    transaction: OwnerTransaction,
    organizationId: string,
    edgeId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    await this.recordChange(
      transaction,
      organizationId,
      'curated_edge',
      edgeId,
      operation,
    );
  }

  async recordOperatorIntent(
    transaction: OwnerTransaction,
    organizationId: string,
    aggregateKind: KnowledgeGraphAggregateKind,
    aggregateId: string,
  ): Promise<boolean> {
    const condition = and(
      eq(outboxAggregateVersion.organizationId, organizationId),
      eq(outboxAggregateVersion.aggregateKind, aggregateKind),
      eq(outboxAggregateVersion.aggregateId, aggregateId),
    );
    const [current] = await transaction
      .select({
        desiredSeq: outboxAggregateVersion.desiredSeq,
        deleted: outboxAggregateVersion.deleted,
      })
      .from(outboxAggregateVersion)
      .where(condition)
      .for('update')
      .limit(1);

    if (!current) {
      return this.backfillIfMissing(
        transaction,
        organizationId,
        aggregateKind,
        aggregateId,
      );
    }
    if (current.deleted) return false;

    const [updated] = await transaction
      .update(outboxAggregateVersion)
      .set({
        desiredSeq: sql`${outboxAggregateVersion.desiredSeq} + 1`,
        projectionStatus: 'pending',
        lastError: null,
        requeueCount: 0,
        lastRequeuedAt: null,
        updatedAt: sql`now()`,
      })
      .where(condition)
      .returning({ desiredSeq: outboxAggregateVersion.desiredSeq });
    if (!updated) throw new Error('KNOWLEDGE_GRAPH_OPERATOR_INTENT_MISSING');

    await this.outbox.add(transaction, {
      topic: KNOWLEDGE_GRAPH_OUTBOX_TOPIC,
      key: JSON.stringify([aggregateKind, organizationId, aggregateId]),
      payload: OutboxAggregateEventSchema.parse({
        organizationId,
        aggregateKind,
        aggregateId,
        operation: 'changed',
        sourceVersion: updated.desiredSeq,
        occurredAt: new Date().toISOString(),
      }),
    });
    return true;
  }

  async backfillIfMissing(
    transaction: OwnerTransaction,
    organizationId: string,
    aggregateKind: KnowledgeGraphAggregateKind,
    aggregateId: string,
    operation: 'changed' | 'removed' = 'changed',
  ): Promise<boolean> {
    const now = new Date();
    const [source] = await transaction
      .insert(outboxAggregateVersion)
      .values({
        organizationId,
        aggregateKind,
        aggregateId,
        desiredSeq: 1,
        deleted: operation === 'removed',
        projectionStatus: 'pending',
        lastError: null,
        updatedAt: sql`now()`,
      })
      .onConflictDoNothing({
        target: [
          outboxAggregateVersion.organizationId,
          outboxAggregateVersion.aggregateKind,
          outboxAggregateVersion.aggregateId,
        ],
      })
      .returning({ desiredSeq: outboxAggregateVersion.desiredSeq });
    if (!source) return false;

    await this.outbox.add(transaction, {
      topic: KNOWLEDGE_GRAPH_OUTBOX_TOPIC,
      key: JSON.stringify([aggregateKind, organizationId, aggregateId]),
      payload: OutboxAggregateEventSchema.parse({
        organizationId,
        aggregateKind,
        aggregateId,
        operation,
        sourceVersion: source.desiredSeq,
        occurredAt: now.toISOString(),
      }),
    });
    return true;
  }

  async requeuePendingBatch(
    transaction: OwnerTransaction,
    limit: number,
  ): Promise<number> {
    const version = outboxAggregateVersion;
    const cooldown = sql`least(${REQUEUE_COOLDOWN_BASE_MS} * power(2, least(${version.requeueCount}, 4)), ${REQUEUE_COOLDOWN_MAX_MS}) * interval '1 millisecond'`;
    const sources = await transaction
      .select()
      .from(outboxAggregateVersion)
      .where(
        and(
          lt(
            outboxAggregateVersion.appliedSeq,
            outboxAggregateVersion.desiredSeq,
          ),
          or(
            and(
              eq(version.projectionStatus, 'pending'),
              lt(
                sql`coalesce(${version.lastRequeuedAt}, ${version.updatedAt})`,
                sql`now() - ${cooldown}`,
              ),
            ),
            and(
              eq(version.projectionStatus, 'applying'),
              lt(
                version.lastAttemptedAt,
                sql`now() - ${APPLYING_STALL_AFTER_MS} * interval '1 millisecond'`,
              ),
            ),
            and(
              eq(version.projectionStatus, 'retry_scheduled'),
              lt(
                version.lastAttemptedAt,
                sql`now() - ${RETRY_STALL_AFTER_MS} * interval '1 millisecond'`,
              ),
            ),
          ),
        ),
      )
      .orderBy(
        asc(
          sql`coalesce(${outboxAggregateVersion.lastRequeuedAt}, 'epoch'::timestamptz)`,
        ),
        asc(outboxAggregateVersion.updatedAt),
        asc(outboxAggregateVersion.organizationId),
        asc(outboxAggregateVersion.aggregateKind),
        asc(outboxAggregateVersion.aggregateId),
      )
      .limit(limit)
      .for('update', { skipLocked: true });
    let requeued = 0;
    for (const source of sources) {
      if (await this.requeueCurrent(transaction, source)) requeued += 1;
    }
    return requeued;
  }

  async requeueCurrent(
    transaction: OwnerTransaction,
    source: Pick<
      typeof outboxAggregateVersion.$inferSelect,
      | 'organizationId'
      | 'aggregateKind'
      | 'aggregateId'
      | 'desiredSeq'
      | 'deleted'
    >,
  ): Promise<boolean> {
    const now = new Date();
    const [eligible] = await transaction
      .update(outboxAggregateVersion)
      .set({
        projectionStatus: 'pending',
        lastError: null,
        lastRequeuedAt: sql`now()`,
        requeueCount: sql`${outboxAggregateVersion.requeueCount} + 1`,
      })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, source.organizationId),
          eq(outboxAggregateVersion.aggregateKind, source.aggregateKind),
          eq(outboxAggregateVersion.aggregateId, source.aggregateId),
          eq(outboxAggregateVersion.desiredSeq, source.desiredSeq),
          lt(outboxAggregateVersion.appliedSeq, source.desiredSeq),
          ne(outboxAggregateVersion.projectionStatus, 'failed'),
        ),
      )
      .returning({ desiredSeq: outboxAggregateVersion.desiredSeq });
    if (!eligible) return false;
    await this.outbox.add(transaction, {
      topic: KNOWLEDGE_GRAPH_OUTBOX_TOPIC,
      key: JSON.stringify([
        source.aggregateKind,
        source.organizationId,
        source.aggregateId,
      ]),
      payload: OutboxAggregateEventSchema.parse({
        organizationId: source.organizationId,
        aggregateKind: source.aggregateKind,
        aggregateId: source.aggregateId,
        operation: source.deleted ? 'removed' : 'changed',
        sourceVersion: source.desiredSeq,
        occurredAt: now.toISOString(),
      }),
    });
    return true;
  }

  async recordObservedSnapshot(
    transaction: OwnerTransaction,
    source: Pick<
      typeof outboxAggregateVersion.$inferSelect,
      'organizationId' | 'aggregateKind' | 'aggregateId' | 'desiredSeq'
    >,
    snapshot: Pick<typeof outboxAggregateVersion.$inferSelect, 'deleted'> & {
      snapshotDigest: NonNullable<
        typeof outboxAggregateVersion.$inferSelect.appliedSnapshotDigest
      >;
    },
  ): Promise<boolean> {
    const [current] = await transaction
      .select()
      .from(outboxAggregateVersion)
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, source.organizationId),
          eq(outboxAggregateVersion.aggregateKind, source.aggregateKind),
          eq(outboxAggregateVersion.aggregateId, source.aggregateId),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !current ||
      current.desiredSeq !== source.desiredSeq ||
      current.appliedSeq < current.desiredSeq ||
      (current.deleted === snapshot.deleted &&
        current.appliedSnapshotDigest === snapshot.snapshotDigest)
    )
      return false;
    await this.recordChange(
      transaction,
      source.organizationId,
      source.aggregateKind,
      source.aggregateId,
      snapshot.deleted ? 'removed' : 'changed',
    );
    return true;
  }

  async recordObservedDeletion(
    transaction: OwnerTransaction,
    source: Pick<
      typeof outboxAggregateVersion.$inferSelect,
      | 'organizationId'
      | 'aggregateKind'
      | 'aggregateId'
      | 'desiredSeq'
      | 'deleted'
    >,
    deleted: boolean,
  ): Promise<boolean> {
    const [current] = await transaction
      .select()
      .from(outboxAggregateVersion)
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, source.organizationId),
          eq(outboxAggregateVersion.aggregateKind, source.aggregateKind),
          eq(outboxAggregateVersion.aggregateId, source.aggregateId),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !current ||
      current.desiredSeq !== source.desiredSeq ||
      current.deleted === deleted
    )
      return false;
    await this.recordChange(
      transaction,
      source.organizationId,
      source.aggregateKind,
      source.aggregateId,
      deleted ? 'removed' : 'changed',
    );
    return true;
  }

  private async recordChange(
    transaction: OwnerTransaction,
    organizationId: string,
    aggregateKind: KnowledgeGraphAggregateKind,
    aggregateId: string,
    operation: 'changed' | 'removed',
  ): Promise<void> {
    const now = new Date();
    const [source] = await transaction
      .insert(outboxAggregateVersion)
      .values({
        organizationId,
        aggregateKind,
        aggregateId,
        desiredSeq: 1,
        deleted: operation === 'removed',
        projectionStatus: 'pending',
        lastError: null,
        updatedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [
          outboxAggregateVersion.organizationId,
          outboxAggregateVersion.aggregateKind,
          outboxAggregateVersion.aggregateId,
        ],
        set: {
          desiredSeq: sql`${outboxAggregateVersion.desiredSeq} + 1`,
          deleted: operation === 'removed',
          projectionStatus: 'pending',
          lastError: null,
          updatedAt: sql`now()`,
          lastRequeuedAt: null,
          requeueCount: 0,
        },
      })
      .returning({ desiredSeq: outboxAggregateVersion.desiredSeq });

    if (!source) {
      throw new Error('그래프 이벤트의 원본 변경 순서를 저장하지 못했습니다.');
    }

    const payload = OutboxAggregateEventSchema.parse({
      organizationId,
      aggregateKind,
      aggregateId,
      operation,
      sourceVersion: source.desiredSeq,
      occurredAt: now.toISOString(),
    });
    const key = JSON.stringify([aggregateKind, organizationId, aggregateId]);
    await this.outbox.add(transaction, {
      topic: KNOWLEDGE_GRAPH_OUTBOX_TOPIC,
      key,
      payload,
    });
    if (semanticSourceKinds.some((kind) => kind === aggregateKind)) {
      await this.outbox.add(transaction, {
        topic: KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
        key,
        payload,
      });
    }
  }
}
