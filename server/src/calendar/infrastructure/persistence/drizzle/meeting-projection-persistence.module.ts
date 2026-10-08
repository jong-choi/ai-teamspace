import { Module } from '@nestjs/common';

import { MeetingProjectionSourceDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/meeting-projection-source.repository';
import { MeetingRecurrenceProjectionSourceDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/meeting-recurrence-projection-source.repository';
import { MeetingRoomProjectionSourceDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/meeting-room-projection-source.repository';
import { MeetingProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-projection-source.repository';
import { MeetingRecurrenceProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-recurrence-projection-source.repository';
import { MeetingRoomProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-room-projection-source.repository';
import { DatabaseModule } from '@/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: MeetingRoomProjectionSourceRepository,
      useClass: MeetingRoomProjectionSourceDrizzleRepository,
    },
    {
      provide: MeetingRecurrenceProjectionSourceRepository,
      useClass: MeetingRecurrenceProjectionSourceDrizzleRepository,
    },
    {
      provide: MeetingProjectionSourceRepository,
      useClass: MeetingProjectionSourceDrizzleRepository,
    },
  ],
  exports: [
    MeetingProjectionSourceRepository,
    MeetingRoomProjectionSourceRepository,
    MeetingRecurrenceProjectionSourceRepository,
  ],
})
export class MeetingProjectionPersistenceModule {}
