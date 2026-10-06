import type { Meeting } from '#server/calendar/domain/meeting.js';
import type { MeetingAttendee } from '#server/calendar/domain/meeting-attendee.js';
import type { MeetingRecurrenceSeries } from '#server/calendar/domain/meeting-recurrence-series.js';
import type { MeetingRoom } from '#server/calendar/domain/meeting-room.js';

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

export type ParticipantBusyInterval = {
  meetingId: string;
  userId: string;
  startAt: Date;
  endAt: Date;
  sourceType: 'organizer' | 'attendee';
};

export type RoomBusyInterval = {
  meetingId: string;
  meetingRoomId: string;
  startAt: Date;
  endAt: Date;
};

export type FindParticipantBusyIntervalsInput = {
  organizationId: string;
  userIds: readonly string[];
  startAt: Date;
  endAt: Date;
  excludeMeetingIds?: readonly string[];
};

export type FindRoomBusyIntervalsInput = {
  organizationId: string;
  meetingRoomId: string;
  startAt: Date;
  endAt: Date;
  excludeMeetingIds?: readonly string[];
};

export type ListMeetingsInRangeInput = {
  organizationId: string;
  from: Date;
  to: Date;
  category?: Meeting['category'];
  projectId?: string;
  attendeeUserId?: string;
  roomId?: string;
  search?: string;
  searchParticipantUserIds?: readonly string[];
};

export type MeetingScheduleTemplate = Pick<
  Meeting,
  | 'organizationId'
  | 'projectId'
  | 'organizerUserId'
  | 'title'
  | 'category'
  | 'timeZone'
  | 'locationType'
  | 'meetingRoomId'
  | 'locationText'
  | 'agendaMarkdown'
  | 'notesMarkdown'
  | 'reminderMinutes'
  | 'iCalUid'
>;

export type MeetingOccurrenceSchedule = {
  startAt: Date;
  endAt: Date;
  recurrenceOriginalStartAt: Date | null;
};

export type CreateRecurrenceSeriesRecordInput = Pick<
  MeetingRecurrenceSeries,
  | 'organizationId'
  | 'frequency'
  | 'interval'
  | 'count'
  | 'until'
  | 'byWeekday'
  | 'timeZone'
>;

export type ScheduleMeetingInput = {
  template: MeetingScheduleTemplate;
  attendeeUserIds: readonly string[];
  occurrences: readonly MeetingOccurrenceSchedule[];
  recurrence: CreateRecurrenceSeriesRecordInput | null;
};

export type CalendarSchedulingConflict = {
  participantConflicts: ParticipantBusyInterval[];
  roomConflict: RoomBusyInterval | null;
};

export type ScheduleMeetingResult =
  | ({ status: 'conflict' } & CalendarSchedulingConflict)
  | { status: 'room_unavailable' }
  | {
      status: 'scheduled';
      records: CalendarMeetingDetailRecord[];
    };

export type EditMeetingDetailsInput = {
  organizationId: string;
  meetingId: string;
  changes: Partial<
    Pick<Meeting, 'projectId' | 'title' | 'category' | 'reminderMinutes'>
  >;
};

export type ReplaceMeetingAttendeesInput = {
  organizationId: string;
  meetingId: string;
  attendeeUserIds: readonly string[];
  conflictUserIds: readonly string[];
};

export type ReplaceMeetingAttendeesResult =
  | ({ status: 'conflict' } & CalendarSchedulingConflict)
  | { status: 'updated'; record: CalendarMeetingDetailRecord }
  | { status: 'not_found' }
  | { status: 'canceled' };

export type RescheduleMeetingUpdate = {
  meetingId: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  locationType: Meeting['locationType'];
  meetingRoomId: string | null;
  locationText: string | null;
  recurrenceOriginalStartAt?: Date;
};

export type RecurrenceSeriesUpdateChanges = Partial<
  Pick<MeetingRecurrenceSeries, 'count' | 'until' | 'timeZone' | 'byWeekday'>
>;

export type RecurrenceSeriesMutation =
  | {
      kind: 'update';
      seriesId: string;
      changes: RecurrenceSeriesUpdateChanges;
    }
  | {
      kind: 'split';
      sourceSeriesId: string;
      sourceChanges: RecurrenceSeriesUpdateChanges;
      create: CreateRecurrenceSeriesRecordInput;
      meetingIds: readonly string[];
    };

export type RescheduleMeetingsInput = {
  organizationId: string;
  updates: readonly RescheduleMeetingUpdate[];
  allowedCanceledMeetingIds?: readonly string[];
  recurrenceMutation?: RecurrenceSeriesMutation;
};

export type RescheduleMeetingsResult =
  | ({ status: 'conflict' } & CalendarSchedulingConflict)
  | { status: 'updated'; records: CalendarMeetingDetailRecord[] }
  | { status: 'not_found' }
  | { status: 'canceled' }
  | { status: 'room_unavailable' };

export type CancelMeetingsInput = {
  organizationId: string;
  meetingIds: readonly string[];
  canceledByUserId: string;
  cancelReason: string | null;
};

export type UpdateAttendeeRsvpResult =
  | ({ status: 'conflict' } & CalendarSchedulingConflict)
  | { status: 'updated'; attendee: MeetingAttendee }
  | { status: 'not_attendee' }
  | { status: 'not_found' }
  | { status: 'canceled' };

export type CreateMeetingRoomRecordInput = Pick<
  MeetingRoom,
  'organizationId' | 'name' | 'capacity' | 'floor' | 'description'
>;

export type UpdateMeetingRoomRecordInput = {
  organizationId: string;
  meetingRoomId: string;
  changes: Partial<
    Pick<MeetingRoom, 'name' | 'capacity' | 'floor' | 'description' | 'active'>
  >;
};

export abstract class CalendarRepository {
  abstract listMeetingsInRange(
    input: ListMeetingsInRangeInput,
  ): Promise<CalendarMeetingListRecord[]>;

  abstract findMeetingById(
    organizationId: string,
    meetingId: string,
  ): Promise<CalendarMeetingDetailRecord | null>;

  abstract listMeetingsInSeries(
    organizationId: string,
    recurrenceSeriesId: string,
  ): Promise<CalendarMeetingDetailRecord[]>;

  abstract findParticipantBusyIntervals(
    input: FindParticipantBusyIntervalsInput,
  ): Promise<ParticipantBusyInterval[]>;

  abstract findRoomBusyIntervals(
    input: FindRoomBusyIntervalsInput,
  ): Promise<RoomBusyInterval[]>;

  abstract scheduleMeeting(
    input: ScheduleMeetingInput,
  ): Promise<ScheduleMeetingResult>;

  abstract editMeetingDetails(
    input: EditMeetingDetailsInput,
  ): Promise<CalendarMeetingDetailRecord | null>;

  abstract replaceMeetingAttendees(
    input: ReplaceMeetingAttendeesInput,
  ): Promise<ReplaceMeetingAttendeesResult>;

  abstract rescheduleMeetings(
    input: RescheduleMeetingsInput,
  ): Promise<RescheduleMeetingsResult>;

  abstract cancelMeetings(
    input: CancelMeetingsInput,
  ): Promise<CalendarMeetingDetailRecord[]>;

  abstract updateAttendeeRsvp(
    organizationId: string,
    meetingId: string,
    userId: string,
    status: Exclude<MeetingAttendee['status'], 'pending'>,
  ): Promise<UpdateAttendeeRsvpResult>;

  abstract updateMeetingAgenda(
    organizationId: string,
    meetingId: string,
    agendaMarkdown: string,
  ): Promise<CalendarMeetingDetailRecord | null>;

  abstract updateMeetingNotes(
    organizationId: string,
    meetingId: string,
    notesMarkdown: string,
  ): Promise<CalendarMeetingDetailRecord | null>;

  abstract listMeetingRooms(organizationId: string): Promise<MeetingRoom[]>;

  abstract findMeetingRoomById(
    organizationId: string,
    meetingRoomId: string,
  ): Promise<MeetingRoom | null>;

  abstract createMeetingRoom(
    input: CreateMeetingRoomRecordInput,
  ): Promise<MeetingRoom>;

  abstract updateMeetingRoom(
    input: UpdateMeetingRoomRecordInput,
  ): Promise<MeetingRoom | null>;
}
