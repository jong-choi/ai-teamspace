import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { CalendarController } from '@/calendar/calendar.controller';
import { CalendarService } from '@/calendar/calendar.service';
import { CalendarIcsService } from '@/calendar/calendar-ics.service';
import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import { CalendarRecurrenceService } from '@/calendar/calendar-recurrence.service';
import { CalendarSchedulingService } from '@/calendar/calendar-scheduling.service';
import { CalendarDrizzlePersistenceModule } from '@/calendar/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { ProjectsCalendarReferenceModule } from '@/calendar/infrastructure/project/projects/projects-calendar-reference.module';
import { BullMqCalendarReminderModule } from '@/calendar/infrastructure/reminder/bullmq/bullmq-calendar-reminder.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { OrganizationsModule } from '@/organizations/organizations.module';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    CalendarDrizzlePersistenceModule,
    ProjectsCalendarReferenceModule,
    BullMqCalendarReminderModule,
  ],
  controllers: [CalendarController],
  providers: [
    CalendarMeetingLoader,
    CalendarMeetingPolicy,
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
