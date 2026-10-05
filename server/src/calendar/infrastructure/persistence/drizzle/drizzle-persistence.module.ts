import { Module } from '@nestjs/common';

import { CalendarRepository } from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import { CalendarDrizzleRepository } from '#server/calendar/infrastructure/persistence/drizzle/repositories/calendar.repository.js';

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
