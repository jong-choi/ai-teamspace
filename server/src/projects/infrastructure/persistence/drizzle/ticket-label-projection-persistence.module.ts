import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { TicketLabelProjectionSourceDrizzleRepository } from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-label-projection-source.repository';
import { TicketLabelProjectionSourceRepository } from '@/projects/infrastructure/persistence/ticket-label-projection-source.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: TicketLabelProjectionSourceRepository,
      useClass: TicketLabelProjectionSourceDrizzleRepository,
    },
  ],
  exports: [TicketLabelProjectionSourceRepository],
})
export class TicketLabelProjectionPersistenceModule {}
