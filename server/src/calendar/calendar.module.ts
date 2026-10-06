import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { CalendarAvailabilityService } from '@/calendar/calendar-availability.service';
import { CalendarIcsController } from '@/calendar/calendar-ics.controller';
import { CalendarIcsService } from '@/calendar/calendar-ics.service';
import { CalendarMeetingContentService } from '@/calendar/calendar-meeting-content.service';
import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import { CalendarMeetingQueryService } from '@/calendar/calendar-meeting-query.service';
import { CalendarMeetingRoomService } from '@/calendar/calendar-meeting-room.service';
import { CalendarParticipantPolicy } from '@/calendar/calendar-participant.policy';
import { CalendarMeetingsController } from '@/calendar/calendar-meetings.controller';
import { CalendarParticipationController } from '@/calendar/calendar-participation.controller';
import { CalendarParticipationService } from '@/calendar/calendar-participation.service';
import { CalendarRecurrenceService } from '@/calendar/calendar-recurrence.service';
import { CalendarRoomsController } from '@/calendar/calendar-rooms.controller';
import { CalendarSchedulingController } from '@/calendar/calendar-scheduling.controller';
import { CalendarSchedulingConflictPolicy } from '@/calendar/calendar-scheduling-conflict.policy';
import { CalendarSchedulingService } from '@/calendar/calendar-scheduling.service';
import { CalendarDrizzlePersistenceModule } from '@/calendar/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { ProjectsCalendarReferenceModule } from '@/calendar/infrastructure/project/projects/projects-calendar-reference.module';
import { BullMqCalendarReminderModule } from '@/calendar/infrastructure/reminder/bullmq/bullmq-calendar-reminder.module';
import { RecurrenceSchedulingPlanService } from '@/calendar/recurrence-scheduling-plan.service';
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
    CalendarMeetingQueryService,
    CalendarMeetingContentService,
    CalendarMeetingRoomService,
    CalendarParticipantPolicy,
    CalendarAvailabilityService,
    CalendarSchedulingConflictPolicy,
    CalendarParticipationService,
    CalendarRecurrenceService,
    RecurrenceSchedulingPlanService,
    CalendarSchedulingService,
    CalendarIcsService,
    TrustedOriginGuard,
  ],
  exports: [CalendarSchedulingService],
})
export class CalendarModule {}
