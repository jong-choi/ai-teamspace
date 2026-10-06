import { Injectable } from '@nestjs/common';

import {
  CalendarMeetingNotFoundError,
  CalendarMeetingRoomInactiveError,
  CalendarMeetingRoomNotFoundError,
} from '@/calendar/domain/calendar.error';
import {
  type CalendarMeetingDetailRecord,
  CalendarRepository,
} from '@/calendar/infrastructure/persistence/calendar.repository';

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
