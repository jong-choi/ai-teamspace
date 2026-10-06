import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import type { CancelMeetingInput } from '@/calendar/dto/cancel-meeting.dto';
import type { CreateMeetingInput } from '@/calendar/dto/create-meeting.dto';
import type { RescheduleMeetingInput } from '@/calendar/dto/reschedule-meeting.dto';
import type { CalendarMeetingDetailRecord } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import type { CalendarSchedulingConflict } from '@/calendar/infrastructure/persistence/calendar-availability.repository';

export type ScheduleMeetingResult =
  | ({ status: 'conflict' } & CalendarSchedulingConflict)
  | { status: 'room_unavailable' }
  | { status: 'scheduled'; records: CalendarMeetingDetailRecord[] };

export type RecurrenceSeriesMutation =
  | {
      kind: 'update';
      seriesId: MeetingRecurrenceSeries['id'];
      changes: Partial<
        Pick<
          MeetingRecurrenceSeries,
          'count' | 'until' | 'timeZone' | 'byWeekday'
        >
      >;
    }
  | {
      kind: 'split';
      sourceSeriesId: MeetingRecurrenceSeries['id'];
      sourceChanges: Partial<
        Pick<
          MeetingRecurrenceSeries,
          'count' | 'until' | 'timeZone' | 'byWeekday'
        >
      >;
      create: Pick<
        MeetingRecurrenceSeries,
        'frequency' | 'interval' | 'count' | 'until' | 'byWeekday' | 'timeZone'
      >;
      meetingIds: readonly Meeting['id'][];
    };

export type RescheduleMeetingsResult =
  | ({ status: 'conflict' } & CalendarSchedulingConflict)
  | { status: 'updated'; records: CalendarMeetingDetailRecord[] }
  | { status: 'not_found' }
  | { status: 'canceled' }
  | { status: 'room_unavailable' };

export abstract class CalendarSchedulingRepository {
  abstract scheduleMeeting(
    organizationId: Meeting['organizationId'],
    organizerUserId: Meeting['organizerUserId'],
    input: CreateMeetingInput,
    attendeeUserIds: readonly MeetingAttendee['userId'][],
    occurrences: readonly Pick<
      Meeting,
      'startAt' | 'endAt' | 'recurrenceOriginalStartAt'
    >[],
    recurrence: Pick<
      MeetingRecurrenceSeries,
      'frequency' | 'interval' | 'count' | 'until' | 'byWeekday' | 'timeZone'
    > | null,
    iCalUid: Meeting['iCalUid'],
  ): Promise<ScheduleMeetingResult>;

  abstract rescheduleMeetings(
    organizationId: Meeting['organizationId'],
    input: RescheduleMeetingInput,
    updates: readonly (Pick<Meeting, 'id' | 'startAt' | 'endAt'> &
      Partial<Pick<Meeting, 'recurrenceOriginalStartAt'>>)[],
    allowedCanceledMeetingIds: readonly Meeting['id'][],
    recurrenceMutation?: RecurrenceSeriesMutation,
  ): Promise<RescheduleMeetingsResult>;

  abstract cancelMeetings(
    organizationId: Meeting['organizationId'],
    meetingIds: readonly Meeting['id'][],
    canceledByUserId: Meeting['canceledByUserId'] extends infer Value
      ? Exclude<Value, null>
      : never,
    input: CancelMeetingInput,
  ): Promise<CalendarMeetingDetailRecord[]>;
}
