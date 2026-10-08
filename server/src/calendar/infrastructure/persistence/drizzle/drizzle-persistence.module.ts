import { Module } from '@nestjs/common';

import { CalendarAvailabilityRepository } from '@/calendar/infrastructure/persistence/calendar-availability.repository';
import { CalendarMeetingQueryRepository } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { CalendarSchedulingRepository } from '@/calendar/infrastructure/persistence/calendar-scheduling.repository';
import { CalendarAvailabilityDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar-availability.repository';
import { CalendarMeetingQueryDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar-meeting-query.repository';
import { CalendarSchedulingDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar-scheduling.repository';
import { MeetingContentDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/meeting-content.repository';
import { MeetingParticipationDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/meeting-participation.repository';
import { MeetingRoomDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/meeting-room.repository';
import { MeetingContentRepository } from '@/calendar/infrastructure/persistence/meeting-content.repository';
import { MeetingParticipationRepository } from '@/calendar/infrastructure/persistence/meeting-participation.repository';
import { MeetingRoomRepository } from '@/calendar/infrastructure/persistence/meeting-room.repository';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';

@Module({
  imports: [OutboxInfrastructureModule],
  providers: [
    {
      provide: CalendarMeetingQueryRepository,
      useClass: CalendarMeetingQueryDrizzleRepository,
    },
    {
      provide: CalendarAvailabilityRepository,
      useClass: CalendarAvailabilityDrizzleRepository,
    },
    {
      provide: CalendarSchedulingRepository,
      useClass: CalendarSchedulingDrizzleRepository,
    },
    {
      provide: MeetingParticipationRepository,
      useClass: MeetingParticipationDrizzleRepository,
    },
    {
      provide: MeetingContentRepository,
      useClass: MeetingContentDrizzleRepository,
    },
    {
      provide: MeetingRoomRepository,
      useClass: MeetingRoomDrizzleRepository,
    },
  ],
  exports: [
    CalendarMeetingQueryRepository,
    CalendarAvailabilityRepository,
    CalendarSchedulingRepository,
    MeetingParticipationRepository,
    MeetingContentRepository,
    MeetingRoomRepository,
  ],
})
export class CalendarDrizzlePersistenceModule {}
