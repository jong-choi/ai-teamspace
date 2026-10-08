import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { TicketProjectionSourceDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-projection-source.repository';
import { TicketProjectionSourceRepository } from '@/projects/infrastructure/persistence/ticket-projection-source.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: TicketProjectionSourceRepository,
      useClass: TicketProjectionSourceDrizzleRepository,
    },
  ],
  exports: [TicketProjectionSourceRepository],
})
export class TicketProjectionPersistenceModule {}
