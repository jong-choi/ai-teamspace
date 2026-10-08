import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import type { ReconciliationScope } from '@/knowledge-graph/domain/reconciliation-scope';
import { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';
import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';

import { and, eq, gt, isNull, sql } from 'drizzle-orm';

@Injectable()
export class OutboxProjectionDeliveryAdapter extends ProjectionDeliveryRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: OutboxAggregateChangePublisher,
  ) {
    super();
  }
  requeuePendingBatch(limit: number): Promise<number> {
    return this.database.db.transaction((transaction) =>
      this.events.requeuePendingBatch(transaction, limit),
    );
  }
  recordObservedSnapshot(
    ...[source, snapshot, scope]: Parameters<
      ProjectionDeliveryRepository['recordObservedSnapshot']
    >
  ): ReturnType<ProjectionDeliveryRepository['recordObservedSnapshot']> {
    return this.database.db.transaction(async (transaction) => {
      if (
        scope.purpose !== 'membership_sources' ||
        !(await this.lockScope(transaction, scope))
      )
        return 'lease_lost';
      return (await this.events.recordObservedSnapshot(
        transaction,
        source,
        snapshot,
      ))
        ? 'recorded'
        : 'unchanged';
    });
  }
  async initializeBatch(
    ...[kind, organizationId, sources, scope]: Parameters<
      ProjectionDeliveryRepository['initializeBatch']
    >
  ): Promise<boolean> {
    return this.database.db.transaction(async (transaction) => {
      if (
        scope &&
        (scope.purpose !== 'owner_sources' ||
          scope.organizationId !== organizationId ||
          scope.aggregateKind !== kind)
      )
        return false;
      if (!(await this.lockScope(transaction, scope))) return false;
      for (const source of sources) {
        await this.events.backfillIfMissing(
          transaction,
          organizationId,
          kind,
          source.id,
          source.deletedAt ? 'removed' : 'changed',
        );
      }
      return true;
    });
  }
  async recordObservedDeletion(
    ...[source, deleted]: Parameters<
      ProjectionDeliveryRepository['recordObservedDeletion']
    >
  ): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      await this.events.recordObservedDeletion(transaction, source, deleted);
    });
  }
  recordOrganizationTombstones(
    ...[scope, sources]: Parameters<
      ProjectionDeliveryRepository['recordOrganizationTombstones']
    >
  ): Promise<number | null> {
    return this.database.db.transaction(async (transaction) => {
      if (
        scope.purpose !== 'organization_presence' ||
        !(await this.lockScope(transaction, scope))
      )
        return null;
      let changed = 0;
      for (const source of sources) {
        if (await this.events.recordObservedDeletion(transaction, source, true))
          changed += 1;
      }
      return changed;
    });
  }
  private async lockScope(
    transaction: Parameters<
      Parameters<DatabaseService['db']['transaction']>[0]
    >[0],
    scope: ReconciliationScope | undefined,
  ): Promise<boolean> {
    if (!scope) return true;
    if (!scope.leaseToken) return false;
    const [row] = await transaction
      .select({ id: reconciliationScope.id })
      .from(reconciliationScope)
      .where(
        and(
          eq(reconciliationScope.id, scope.id),
          eq(reconciliationScope.purpose, scope.purpose),
          scope.organizationId
            ? eq(reconciliationScope.organizationId, scope.organizationId)
            : isNull(reconciliationScope.organizationId),
          scope.aggregateKind
            ? eq(reconciliationScope.aggregateKind, scope.aggregateKind)
            : isNull(reconciliationScope.aggregateKind),
          eq(reconciliationScope.leaseToken, scope.leaseToken),
          gt(reconciliationScope.leaseUntil, sql`now()`),
        ),
      )
      .for('update')
      .limit(1);
    return row !== undefined;
  }
}
