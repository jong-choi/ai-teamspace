import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { CalendarController } from '#server/calendar/calendar.controller.js';
import { CalendarService } from '#server/calendar/calendar.service.js';
import { CalendarIcsService } from '#server/calendar/calendar-ics.service.js';
import { CalendarMeetingPresenterService } from '#server/calendar/calendar-meeting-presenter.service.js';
import { CalendarRecurrenceService } from '#server/calendar/calendar-recurrence.service.js';
import { CalendarSchedulingService } from '#server/calendar/calendar-scheduling.service.js';
import { CalendarDrizzlePersistenceModule } from '#server/calendar/infrastructure/persistence/drizzle/drizzle-persistence.module.js';
import { UnavailableCalendarProjectReferenceModule } from '#server/calendar/infrastructure/project/unavailable/unavailable-calendar-project-reference.module.js';
import { BullMqCalendarReminderModule } from '#server/calendar/infrastructure/reminder/bullmq/bullmq-calendar-reminder.module.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { OrganizationsModule } from '#server/organizations/organizations.module.js';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    CalendarDrizzlePersistenceModule,
    UnavailableCalendarProjectReferenceModule,
    BullMqCalendarReminderModule,
  ],
  controllers: [CalendarController],
  providers: [
    CalendarMeetingPresenterService,
    CalendarRecurrenceService,
    CalendarService,
    CalendarSchedulingService,
    CalendarIcsService,
    TrustedOriginGuard,
  ],
  exports: [CalendarService, CalendarSchedulingService],
})
export class CalendarModule {}
