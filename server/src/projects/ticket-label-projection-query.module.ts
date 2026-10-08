import { Module } from '@nestjs/common';

import { TicketLabelProjectionPersistenceModule } from '@/projects/infrastructure/persistence/drizzle/ticket-label-projection-persistence.module';
import { TicketLabelProjectionQueryService } from '@/projects/ticket-label-projection-query.service';

@Module({
  imports: [TicketLabelProjectionPersistenceModule],
  providers: [TicketLabelProjectionQueryService],
  exports: [TicketLabelProjectionQueryService],
})
export class TicketLabelProjectionQueryModule {}
