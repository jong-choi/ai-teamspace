import { Module } from '@nestjs/common';

import { CalendarReferenceLockRepository } from '@/calendar/infrastructure/persistence/calendar-reference-lock.repository';
import { CalendarReferenceLockDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar-reference-lock.repository';
import { DatabaseModule } from '@/database/database.module';
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: CalendarReferenceLockRepository,
      useClass: CalendarReferenceLockDrizzleRepository,
    },
  ],
  exports: [CalendarReferenceLockRepository],
})
export class CalendarReferenceLockPersistenceModule {}
