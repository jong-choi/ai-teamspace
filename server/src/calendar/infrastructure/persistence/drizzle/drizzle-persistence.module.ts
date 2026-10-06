import { Module } from '@nestjs/common';

import { CalendarRepository } from '@/calendar/infrastructure/persistence/calendar.repository';
import { CalendarDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar.repository';

@Module({
  providers: [
    {
      provide: CalendarRepository,
      useClass: CalendarDrizzleRepository,
    },
  ],
  exports: [CalendarRepository],
})
export class CalendarDrizzlePersistenceModule {}
