import { Injectable } from '@nestjs/common';

import {
  CalendarAvailabilityRepository,
  type ParticipantBusyInterval,
  type RoomBusyInterval,
} from '@/calendar/infrastructure/persistence/calendar-availability.repository';
import {
  findParticipantBusyIntervals,
  findRoomBusyIntervals,
} from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar-persistence.helpers';
import { DatabaseService } from '@/database/database.service';

@Injectable()
export class CalendarAvailabilityDrizzleRepository extends CalendarAvailabilityRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  findParticipantBusyIntervals(
    input: Parameters<
      CalendarAvailabilityRepository['findParticipantBusyIntervals']
    >[0],
  ): Promise<ParticipantBusyInterval[]> {
    return findParticipantBusyIntervals(
      this.database.db,
      input.organizationId,
      input.userIds,
      input.startAt,
      input.endAt,
      input.excludeMeetingIds,
    );
  }

  findRoomBusyIntervals(
    input: Parameters<
      CalendarAvailabilityRepository['findRoomBusyIntervals']
    >[0],
  ): Promise<RoomBusyInterval[]> {
    return findRoomBusyIntervals(
      this.database.db,
      input.organizationId,
      input.meetingRoomId,
      input.startAt,
      input.endAt,
      input.excludeMeetingIds,
    );
  }
}
