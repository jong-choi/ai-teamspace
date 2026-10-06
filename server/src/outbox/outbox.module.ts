import { Module } from '@nestjs/common';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';

import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';

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
  exports: [OutboxModule],
})
export class OutboxInfrastructureModule {}
