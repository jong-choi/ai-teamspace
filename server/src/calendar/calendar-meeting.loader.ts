import { Injectable } from '@nestjs/common';

import {
  CalendarMeetingNotFoundError,
  CalendarMeetingRoomInactiveError,
  CalendarMeetingRoomNotFoundError,
} from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingRoom } from '@/calendar/domain/meeting-room';
import {
  type CalendarMeetingDetailRecord,
  CalendarMeetingQueryRepository,
} from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { MeetingRoomRepository } from '@/calendar/infrastructure/persistence/meeting-room.repository';

@Injectable()
export class CalendarMeetingLoader {
  constructor(
    private readonly meetingQueryRepository: CalendarMeetingQueryRepository,
    private readonly meetingRoomRepository: MeetingRoomRepository,
  ) {}

  async requireMeeting(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
  ): Promise<CalendarMeetingDetailRecord> {
    const record = await this.meetingQueryRepository.findMeetingById(
      organizationId,
      meetingId,
    );
    if (!record) {
      throw new CalendarMeetingNotFoundError();
    }
    return record;
  }

  async requireSelectableMeetingRoom(
    organizationId: Meeting['organizationId'],
    meetingRoomId: MeetingRoom['id'],
  ): Promise<void> {
    const room = await this.meetingRoomRepository.findMeetingRoomById(
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
