import { Module } from '@nestjs/common';

import { MeetingProjectionSourceDrizzleRepository } from '@/calendar/infrastructure/persistence/drizzle/repositories/meeting-projection-source.repository';
import { MeetingProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-projection-source.repository';
import { DatabaseModule } from '@/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: MeetingProjectionSourceRepository,
      useClass: MeetingProjectionSourceDrizzleRepository,
    },
  ],
  exports: [MeetingProjectionSourceRepository],
})
export class MeetingProjectionPersistenceModule {}
