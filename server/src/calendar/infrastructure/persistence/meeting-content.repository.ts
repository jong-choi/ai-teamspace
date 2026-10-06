import type { Meeting } from '@/calendar/domain/meeting';
import type { UpdateMeetingInput } from '@/calendar/dto/update-meeting.dto';
import type {
  UpdateMeetingAgendaInput,
  UpdateMeetingNotesInput,
} from '@/calendar/dto/update-meeting-content.dto';
import type { CalendarMeetingDetailRecord } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';

export abstract class MeetingContentRepository {
  abstract editMeetingDetails(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingInput,
  ): Promise<CalendarMeetingDetailRecord | null>;

  abstract updateMeetingAgenda(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingAgendaInput,
  ): Promise<CalendarMeetingDetailRecord | null>;

  abstract updateMeetingNotes(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingNotesInput,
  ): Promise<CalendarMeetingDetailRecord | null>;
}
