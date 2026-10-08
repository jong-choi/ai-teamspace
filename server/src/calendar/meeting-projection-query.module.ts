import { Module } from '@nestjs/common';

import { MeetingProjectionPersistenceModule } from '@/calendar/infrastructure/persistence/drizzle/meeting-projection-persistence.module';
import { MeetingProjectionQueryService } from '@/calendar/meeting-projection-query.service';

@Module({
  imports: [MeetingProjectionPersistenceModule],
  providers: [MeetingProjectionQueryService],
  exports: [MeetingProjectionQueryService],
})
export class MeetingProjectionQueryModule {}
