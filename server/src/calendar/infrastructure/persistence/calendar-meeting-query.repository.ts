import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import type { MeetingRoom } from '@/calendar/domain/meeting-room';

export type CalendarMeetingListRecord = {
  meeting: Meeting;
  meetingRoom: MeetingRoom | null;
  recurrence: MeetingRecurrenceSeries | null;
  attendeeCount: number;
};

export type CalendarMeetingDetailRecord = {
  meeting: Meeting;
  meetingRoom: MeetingRoom | null;
  recurrence: MeetingRecurrenceSeries | null;
  attendees: MeetingAttendee[];
};

export abstract class CalendarMeetingQueryRepository {
  abstract listMeetingsInRange(input: {
    organizationId: Meeting['organizationId'];
    from: Meeting['startAt'];
    to: Meeting['endAt'];
    category?: Meeting['category'];
    projectId?: NonNullable<Meeting['projectId']>;
    attendeeUserId?: MeetingAttendee['userId'];
    roomId?: MeetingRoom['id'];
    search?: Meeting['title'];
    searchParticipantUserIds?: readonly MeetingAttendee['userId'][];
  }): Promise<CalendarMeetingListRecord[]>;

  abstract findMeetingById(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
  ): Promise<CalendarMeetingDetailRecord | null>;

  abstract listMeetingsInSeries(
    organizationId: Meeting['organizationId'],
    recurrenceSeriesId: MeetingRecurrenceSeries['id'],
  ): Promise<CalendarMeetingDetailRecord[]>;
}
