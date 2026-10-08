import { Module } from '@nestjs/common';

import { CalendarReferenceLockQueryService } from '@/calendar/calendar-reference-lock-query.service';
import { CalendarReferenceLockPersistenceModule } from '@/calendar/infrastructure/persistence/drizzle/calendar-reference-lock-persistence.module';
@Module({
  imports: [CalendarReferenceLockPersistenceModule],
  providers: [CalendarReferenceLockQueryService],
  exports: [CalendarReferenceLockQueryService],
})
export class CalendarReferenceLockQueryModule {}
