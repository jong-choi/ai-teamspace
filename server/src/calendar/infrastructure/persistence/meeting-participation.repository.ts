import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { RsvpMeetingInput } from '@/calendar/dto/rsvp-meeting.dto';
import type { UpdateMeetingAttendeesInput } from '@/calendar/dto/update-meeting-attendees.dto';
import type { CalendarMeetingDetailRecord } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import type { CalendarSchedulingConflict } from '@/calendar/infrastructure/persistence/calendar-availability.repository';

export type ReplaceMeetingAttendeesResult =
  | ({ status: 'conflict' } & CalendarSchedulingConflict)
  | { status: 'updated'; record: CalendarMeetingDetailRecord }
  | { status: 'not_found' }
  | { status: 'canceled' };

export type UpdateAttendeeRsvpResult =
  | ({ status: 'conflict' } & CalendarSchedulingConflict)
  | { status: 'updated'; attendee: MeetingAttendee }
  | { status: 'not_attendee' }
  | { status: 'not_found' }
  | { status: 'canceled' };

export abstract class MeetingParticipationRepository {
  abstract replaceMeetingAttendees(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingAttendeesInput,
    conflictUserIds: readonly MeetingAttendee['userId'][],
  ): Promise<ReplaceMeetingAttendeesResult>;

  abstract updateAttendeeRsvp(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    userId: MeetingAttendee['userId'],
    input: RsvpMeetingInput,
  ): Promise<UpdateAttendeeRsvpResult>;
}
