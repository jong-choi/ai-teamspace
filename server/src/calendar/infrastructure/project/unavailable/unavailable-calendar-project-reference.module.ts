import { Module } from '@nestjs/common';

import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';
import { UnavailableCalendarProjectReferenceAdapter } from '#server/calendar/infrastructure/project/unavailable/unavailable-calendar-project-reference.adapter.js';

@Module({
  providers: [
    {
      provide: CalendarProjectReferenceProvider,
      useClass: UnavailableCalendarProjectReferenceAdapter,
    },
  ],
  exports: [CalendarProjectReferenceProvider],
})
export class UnavailableCalendarProjectReferenceModule {}
