import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';

@Injectable()
export class OutboxProjectionDeliveryAdapter extends ProjectionDeliveryRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: OutboxAggregateChangePublisher,
  ) {
    super();
  }
  async initializeBatch(
    ...[kind, organizationId, sources]: Parameters<
      ProjectionDeliveryRepository['initializeBatch']
    >
  ): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      for (const source of sources) {
        await this.events.backfillIfMissing(
          transaction,
          organizationId,
          kind,
          source.id,
          source.deletedAt ? 'removed' : 'changed',
        );
      }
    });
  }
  async requeue(
    ...[source]: Parameters<ProjectionDeliveryRepository['requeue']>
  ): Promise<void> {
    await this.database.db.transaction((transaction) =>
      this.events.requeueCurrent(transaction, source),
    );
  }
  async recordObservedDeletion(
    ...[source, deleted]: Parameters<
      ProjectionDeliveryRepository['recordObservedDeletion']
    >
  ): Promise<void> {
    await this.database.db.transaction((transaction) =>
      this.events.recordObservedDeletion(transaction, source, deleted),
    );
  }
}
