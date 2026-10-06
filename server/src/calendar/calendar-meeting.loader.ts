import { Injectable } from '@nestjs/common';

import {
  CalendarMeetingNotFoundError,
  CalendarMeetingRoomInactiveError,
  CalendarMeetingRoomNotFoundError,
} from '#server/calendar/domain/calendar.error.js';
import {
  type CalendarMeetingDetailRecord,
  CalendarRepository,
} from '#server/calendar/infrastructure/persistence/calendar.repository.js';

@Injectable()
export class CalendarMeetingLoader {
  constructor(private readonly repository: CalendarRepository) {}

  async requireMeeting(
    organizationId: string,
    meetingId: string,
  ): Promise<CalendarMeetingDetailRecord> {
    const record = await this.repository.findMeetingById(
      organizationId,
      meetingId,
    );
    if (!record) {
      throw new CalendarMeetingNotFoundError();
    }
    return record;
  }

  async requireSelectableMeetingRoom(
    organizationId: string,
    meetingRoomId: string,
  ): Promise<void> {
    const room = await this.repository.findMeetingRoomById(
      organizationId,
      meetingRoomId,
    );
    if (!room) {
      throw new CalendarMeetingRoomNotFoundError();
    }
    if (!room.active) {
      throw new CalendarMeetingRoomInactiveError();
    }
  }
}
