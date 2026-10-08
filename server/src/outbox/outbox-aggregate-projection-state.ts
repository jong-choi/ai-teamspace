import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';

import { and, asc, eq, lt } from 'drizzle-orm';

@Injectable()
export class OutboxAggregateProjectionState {
  constructor(private readonly database: DatabaseService) {}

  async current(
    organizationId: string,
    aggregateKind: typeof outboxAggregateVersion.$inferSelect.aggregateKind,
    aggregateId: string,
  ) {
    const [source] = await this.database.db
      .select()
      .from(outboxAggregateVersion)
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, aggregateKind),
          eq(outboxAggregateVersion.aggregateId, aggregateId),
        ),
      )
      .limit(1);
    return source ?? null;
  }

  listUnapplied(limit: number) {
    return this.database.db
      .select()
      .from(outboxAggregateVersion)
      .where(
        lt(
          outboxAggregateVersion.appliedSeq,
          outboxAggregateVersion.desiredSeq,
        ),
      )
      .orderBy(
        asc(outboxAggregateVersion.updatedAt),
        asc(outboxAggregateVersion.organizationId),
        asc(outboxAggregateVersion.aggregateKind),
        asc(outboxAggregateVersion.aggregateId),
      )
      .limit(limit);
  }

  async markApplying(
    organizationId: string,
    aggregateKind: typeof outboxAggregateVersion.$inferSelect.aggregateKind,
    aggregateId: string,
    sourceVersion: number,
  ): Promise<void> {
    await this.database.db
      .update(outboxAggregateVersion)
      .set({
        projectionStatus: 'applying',
        lastAttemptedAt: new Date(),
        lastError: null,
      })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, aggregateKind),
          eq(outboxAggregateVersion.aggregateId, aggregateId),
          eq(outboxAggregateVersion.desiredSeq, sourceVersion),
          lt(outboxAggregateVersion.appliedSeq, sourceVersion),
        ),
      );
  }

  async markApplied(
    organizationId: string,
    aggregateKind: typeof outboxAggregateVersion.$inferSelect.aggregateKind,
    aggregateId: string,
    sourceVersion: number,
  ): Promise<void> {
    await this.database.db
      .update(outboxAggregateVersion)
      .set({
        appliedSeq: sourceVersion,
        projectionStatus: 'applied',
        appliedAt: new Date(),
        lastError: null,
      })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, aggregateKind),
          eq(outboxAggregateVersion.aggregateId, aggregateId),
          eq(outboxAggregateVersion.desiredSeq, sourceVersion),
          lt(outboxAggregateVersion.appliedSeq, sourceVersion),
        ),
      );
  }

  async markFailed(
    organizationId: string,
    aggregateKind: typeof outboxAggregateVersion.$inferSelect.aggregateKind,
    aggregateId: string,
    sourceVersion: number,
  ): Promise<void> {
    await this.setFailureStatus(
      organizationId,
      aggregateKind,
      aggregateId,
      sourceVersion,
      'retry_scheduled',
    );
  }

  async markTerminalFailed(
    organizationId: string,
    aggregateKind: typeof outboxAggregateVersion.$inferSelect.aggregateKind,
    aggregateId: string,
    sourceVersion: number,
  ): Promise<void> {
    await this.setFailureStatus(
      organizationId,
      aggregateKind,
      aggregateId,
      sourceVersion,
      'failed',
    );
  }

  private async setFailureStatus(
    organizationId: string,
    aggregateKind: typeof outboxAggregateVersion.$inferSelect.aggregateKind,
    aggregateId: string,
    sourceVersion: number,
    projectionStatus: 'retry_scheduled' | 'failed',
  ): Promise<void> {
    // 외부 저장소의 원본 오류 문자열 대신 고정된 비민감 오류 코드만 기록한다.
    await this.database.db
      .update(outboxAggregateVersion)
      .set({
        projectionStatus,
        lastAttemptedAt: new Date(),
        lastError: 'KNOWLEDGE_GRAPH_PROJECTION_FAILED',
      })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, aggregateKind),
          eq(outboxAggregateVersion.aggregateId, aggregateId),
          eq(outboxAggregateVersion.desiredSeq, sourceVersion),
          lt(outboxAggregateVersion.appliedSeq, sourceVersion),
        ),
      );
  }
}
