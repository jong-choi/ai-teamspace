import { Injectable } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';

import { DatabaseService } from '@/database/database.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateEventSchema } from '@/outbox/outbox-aggregate-event.schema';

import { and, eq, lt, sql } from 'drizzle-orm';

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
        updatedAt: now,
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
  ): Promise<void> {
    const now = new Date();
    const [eligible] = await transaction
      .update(outboxAggregateVersion)
      .set({ projectionStatus: 'pending', lastError: null })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, source.organizationId),
          eq(outboxAggregateVersion.aggregateKind, source.aggregateKind),
          eq(outboxAggregateVersion.aggregateId, source.aggregateId),
          eq(outboxAggregateVersion.desiredSeq, source.desiredSeq),
          lt(outboxAggregateVersion.appliedSeq, source.desiredSeq),
        ),
      )
      .returning({ desiredSeq: outboxAggregateVersion.desiredSeq });
    if (!eligible) return;
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
        updatedAt: now,
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
          updatedAt: now,
        },
      })
      .returning({ desiredSeq: outboxAggregateVersion.desiredSeq });

    if (!source) {
      throw new Error('그래프 이벤트의 원본 변경 순서를 저장하지 못했습니다.');
    }

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
  }
}
