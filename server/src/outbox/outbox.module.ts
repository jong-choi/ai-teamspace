import { Module } from '@nestjs/common';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';

import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { OutboxSemanticManualRequest } from '@/outbox/outbox-semantic-manual-request';
import { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

@Module({
  imports: [
    DatabaseModule,
    OutboxModule.forRoot({
      relay: {
        enabled: false,
      },
    }),
  ],
  providers: [
    OutboxAggregateChangePublisher,
    OutboxAggregateProjectionState,
    OutboxSemanticSourceState,
    OutboxSemanticManualRequest,
    OutboxSemanticRecovery,
    {
      provide: PostgresOutboxStore,
      inject: [DatabaseService, OutboxStorage],
      useFactory: (databaseService: DatabaseService, storage: OutboxStorage) =>
        new PostgresOutboxStore(
          {
            executor: fromDrizzle(databaseService.db),
            migrate: false,
          },
          storage,
        ),
    },
  ],
  exports: [
    OutboxModule,
    OutboxAggregateChangePublisher,
    OutboxAggregateProjectionState,
    OutboxSemanticSourceState,
    OutboxSemanticManualRequest,
    OutboxSemanticRecovery,
  ],
})
export class OutboxInfrastructureModule {}
