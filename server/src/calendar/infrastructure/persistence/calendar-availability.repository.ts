import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { MeetingRoom } from '@/calendar/domain/meeting-room';

export type ParticipantBusyInterval = {
  meetingId: Meeting['id'];
  userId: MeetingAttendee['userId'];
  startAt: Meeting['startAt'];
  endAt: Meeting['endAt'];
  sourceType: 'organizer' | 'attendee';
};

export type RoomBusyInterval = {
  meetingId: Meeting['id'];
  meetingRoomId: MeetingRoom['id'];
  startAt: Meeting['startAt'];
  endAt: Meeting['endAt'];
};

export type CalendarSchedulingConflict = {
  participantConflicts: ParticipantBusyInterval[];
  roomConflict: RoomBusyInterval | null;
};

export abstract class CalendarAvailabilityRepository {
  abstract findParticipantBusyIntervals(input: {
    organizationId: Meeting['organizationId'];
    userIds: readonly MeetingAttendee['userId'][];
    startAt: Meeting['startAt'];
    endAt: Meeting['endAt'];
    excludeMeetingIds?: readonly Meeting['id'][];
  }): Promise<ParticipantBusyInterval[]>;

  abstract findRoomBusyIntervals(input: {
    organizationId: Meeting['organizationId'];
    meetingRoomId: MeetingRoom['id'];
    startAt: Meeting['startAt'];
    endAt: Meeting['endAt'];
    excludeMeetingIds?: readonly Meeting['id'][];
  }): Promise<RoomBusyInterval[]>;
}
