import type { Meeting } from '#server/calendar/domain/meeting.js';
import type { MeetingAttendee } from '#server/calendar/domain/meeting-attendee.js';
import type { MeetingRoom } from '#server/calendar/domain/meeting-room.js';

export type CalendarMeetingListRecord = {
  meeting: Meeting;
  meetingRoom: MeetingRoom | null;
  attendeeCount: number;
};

export type CalendarMeetingDetailRecord = {
  meeting: Meeting;
  meetingRoom: MeetingRoom | null;
  attendees: MeetingAttendee[];
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

export type CreateMeetingWithAttendeesInput = Pick<
  Meeting,
  | 'organizationId'
  | 'projectId'
  | 'organizerUserId'
  | 'title'
  | 'category'
  | 'startAt'
  | 'endAt'
  | 'timeZone'
  | 'locationType'
  | 'meetingRoomId'
  | 'locationText'
  | 'agendaMarkdown'
  | 'notesMarkdown'
  | 'reminderMinutes'
> & {
  attendeeUserIds: readonly string[];
};

export type EditMeetingDetailsInput = {
  organizationId: string;
  meetingId: string;
  changes: Partial<
    Pick<
      Meeting,
      | 'projectId'
      | 'title'
      | 'category'
      | 'locationType'
      | 'meetingRoomId'
      | 'locationText'
      | 'agendaMarkdown'
      | 'notesMarkdown'
      | 'reminderMinutes'
    >
  >;
  attendeeUserIds?: readonly string[];
};

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

  abstract createMeetingWithAttendees(
    input: CreateMeetingWithAttendeesInput,
  ): Promise<CalendarMeetingDetailRecord>;

  abstract editMeetingDetails(
    input: EditMeetingDetailsInput,
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
