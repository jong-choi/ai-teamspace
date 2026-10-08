import { Module } from '@nestjs/common';

import { TicketProjectionPersistenceModule } from '@/projects/infrastructure/persistence/drizzle/ticket-projection-persistence.module';
import { TicketProjectionQueryService } from '@/projects/ticket-projection-query.service';

@Module({
  imports: [TicketProjectionPersistenceModule],
  providers: [TicketProjectionQueryService],
  exports: [TicketProjectionQueryService],
})
export class TicketProjectionQueryModule {}
