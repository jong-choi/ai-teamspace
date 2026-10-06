import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { CalendarIcsController } from '@/calendar/calendar-ics.controller';
import { CalendarIcsService } from '@/calendar/calendar-ics.service';
import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import { CalendarMeetingsController } from '@/calendar/calendar-meetings.controller';
import { CalendarParticipationController } from '@/calendar/calendar-participation.controller';
import { CalendarRecurrenceService } from '@/calendar/calendar-recurrence.service';
import { CalendarRoomsController } from '@/calendar/calendar-rooms.controller';
import { CalendarSchedulingController } from '@/calendar/calendar-scheduling.controller';
import { CalendarSchedulingService } from '@/calendar/calendar-scheduling.service';
import { CalendarService } from '@/calendar/calendar.service';
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
  controllers: [
    CalendarMeetingsController,
    CalendarSchedulingController,
    CalendarParticipationController,
    CalendarRoomsController,
    CalendarIcsController,
  ],
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
