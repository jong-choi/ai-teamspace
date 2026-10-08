import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { REQUEUE_STUCK_COUNT } from '@/outbox/outbox-aggregate-recovery.policy';

import { and, asc, eq, gt, lt, ne, or, sql } from 'drizzle-orm';

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

  listMembershipObservationBatch(
    cursor: Pick<
      typeof outboxAggregateVersion.$inferSelect,
      'organizationId' | 'aggregateId'
    > | null,
    limit: number,
  ) {
    return this.database.db
      .select()
      .from(outboxAggregateVersion)
      .where(
        and(
          eq(outboxAggregateVersion.aggregateKind, 'membership'),
          eq(
            outboxAggregateVersion.appliedSeq,
            outboxAggregateVersion.desiredSeq,
          ),
          lt(
            outboxAggregateVersion.updatedAt,
            sql`now() - interval '60 seconds'`,
          ),
          cursor
            ? or(
                gt(
                  outboxAggregateVersion.organizationId,
                  cursor.organizationId,
                ),
                and(
                  eq(
                    outboxAggregateVersion.organizationId,
                    cursor.organizationId,
                  ),
                  gt(outboxAggregateVersion.aggregateId, cursor.aggregateId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(
        asc(outboxAggregateVersion.organizationId),
        asc(outboxAggregateVersion.aggregateId),
      )
      .limit(limit);
  }

  listTrackedOrganizationIds(
    afterOrganizationId: string | null,
    limit: number,
  ) {
    const version = outboxAggregateVersion;
    return this.database.db
      .select({ organizationId: version.organizationId })
      .from(version)
      .where(
        afterOrganizationId
          ? gt(version.organizationId, afterOrganizationId)
          : undefined,
      )
      .groupBy(version.organizationId)
      .orderBy(asc(version.organizationId))
      .limit(limit);
  }

  recoveryStats() {
    const version = outboxAggregateVersion;
    return this.database.db
      .select({
        pending:
          sql<number>`count(*) filter (where ${version.projectionStatus} = 'pending')`.mapWith(
            Number,
          ),
        applying:
          sql<number>`count(*) filter (where ${version.projectionStatus} = 'applying')`.mapWith(
            Number,
          ),
        retryScheduled:
          sql<number>`count(*) filter (where ${version.projectionStatus} = 'retry_scheduled')`.mapWith(
            Number,
          ),
        failed:
          sql<number>`count(*) filter (where ${version.projectionStatus} = 'failed')`.mapWith(
            Number,
          ),
        requeueStuck:
          sql<number>`count(*) filter (where ${version.requeueCount} >= ${REQUEUE_STUCK_COUNT})`.mapWith(
            Number,
          ),
        oldestPendingAt:
          sql<Date | null>`min(${version.updatedAt}) filter (where ${version.projectionStatus} = 'pending')`.mapWith(
            version.updatedAt,
          ),
      })
      .from(version)
      .where(lt(version.appliedSeq, version.desiredSeq));
  }

  listLiveSourcesForOrganization(
    organizationId: string,
    cursor: Pick<
      typeof outboxAggregateVersion.$inferSelect,
      'aggregateKind' | 'aggregateId'
    > | null,
    limit: number,
  ) {
    const version = outboxAggregateVersion;
    return this.database.db
      .select()
      .from(version)
      .where(
        and(
          eq(version.organizationId, organizationId),
          eq(version.deleted, false),
          cursor
            ? or(
                gt(version.aggregateKind, cursor.aggregateKind),
                and(
                  eq(version.aggregateKind, cursor.aggregateKind),
                  gt(version.aggregateId, cursor.aggregateId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(version.aggregateKind), asc(version.aggregateId))
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
        lastAttemptedAt: sql`now()`,
        lastError: null,
      })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, aggregateKind),
          eq(outboxAggregateVersion.aggregateId, aggregateId),
          eq(outboxAggregateVersion.desiredSeq, sourceVersion),
          lt(outboxAggregateVersion.appliedSeq, sourceVersion),
          ne(outboxAggregateVersion.projectionStatus, 'failed'),
        ),
      );
  }

  async markApplied(
    organizationId: string,
    aggregateKind: typeof outboxAggregateVersion.$inferSelect.aggregateKind,
    aggregateId: string,
    sourceVersion: number,
    snapshotDigest: NonNullable<
      typeof outboxAggregateVersion.$inferSelect.appliedSnapshotDigest
    >,
  ): Promise<void> {
    await this.database.db
      .update(outboxAggregateVersion)
      .set({
        appliedSeq: sourceVersion,
        projectionStatus: 'applied',
        appliedAt: sql`now()`,
        appliedSnapshotDigest: snapshotDigest,
        requeueCount: 0,
        lastRequeuedAt: null,
        lastError: null,
      })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, aggregateKind),
          eq(outboxAggregateVersion.aggregateId, aggregateId),
          eq(outboxAggregateVersion.desiredSeq, sourceVersion),
          lt(outboxAggregateVersion.appliedSeq, sourceVersion),
          ne(outboxAggregateVersion.projectionStatus, 'failed'),
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
        lastAttemptedAt: sql`now()`,
        lastError: 'KNOWLEDGE_GRAPH_PROJECTION_FAILED',
      })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, aggregateKind),
          eq(outboxAggregateVersion.aggregateId, aggregateId),
          eq(outboxAggregateVersion.desiredSeq, sourceVersion),
          lt(outboxAggregateVersion.appliedSeq, sourceVersion),
          ne(outboxAggregateVersion.projectionStatus, 'failed'),
        ),
      );
  }
}
