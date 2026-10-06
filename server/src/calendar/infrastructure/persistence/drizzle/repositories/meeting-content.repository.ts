import { Injectable } from '@nestjs/common';

import type { Meeting } from '@/calendar/domain/meeting';
import type { UpdateMeetingInput } from '@/calendar/dto/update-meeting.dto';
import type {
  UpdateMeetingAgendaInput,
  UpdateMeetingNotesInput,
} from '@/calendar/dto/update-meeting-content.dto';
import type { CalendarMeetingDetailRecord } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { toMeetingUpdate } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting.mapper';
import { loadMeetingDetails } from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar-persistence.helpers';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { MeetingContentRepository } from '@/calendar/infrastructure/persistence/meeting-content.repository';
import { DatabaseService } from '@/database/database.service';

import { and, eq, sql } from 'drizzle-orm';

@Injectable()
export class MeetingContentDrizzleRepository extends MeetingContentRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async editMeetingDetails(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingInput,
  ): Promise<CalendarMeetingDetailRecord | null> {
    const changes: Partial<
      Pick<Meeting, 'projectId' | 'title' | 'category' | 'reminderMinutes'>
    > = input;
    const [row] = await this.database.db
      .update(meeting)
      .set({
        ...toMeetingUpdate(changes),
        iCalSequence: sql`${meeting.iCalSequence} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(meeting.organizationId, organizationId),
          eq(meeting.id, meetingId),
        ),
      )
      .returning({ id: meeting.id });
    if (!row) return null;
    const [record] = await loadMeetingDetails(
      this.database.db,
      organizationId,
      [meetingId],
    );
    return record ?? null;
  }

  async updateMeetingAgenda(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingAgendaInput,
  ): Promise<CalendarMeetingDetailRecord | null> {
    const changes: Pick<Meeting, 'agendaMarkdown'> = input;
    const [row] = await this.database.db
      .update(meeting)
      .set({
        ...toMeetingUpdate(changes),
        iCalSequence: sql`${meeting.iCalSequence} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(meeting.organizationId, organizationId),
          eq(meeting.id, meetingId),
        ),
      )
      .returning({ id: meeting.id });
    if (!row) return null;
    const [record] = await loadMeetingDetails(
      this.database.db,
      organizationId,
      [meetingId],
    );
    return record ?? null;
  }

  async updateMeetingNotes(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingNotesInput,
  ): Promise<CalendarMeetingDetailRecord | null> {
    const changes: Pick<Meeting, 'notesMarkdown'> = input;
    const [row] = await this.database.db
      .update(meeting)
      .set({
        ...toMeetingUpdate(changes),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(meeting.organizationId, organizationId),
          eq(meeting.id, meetingId),
        ),
      )
      .returning({ id: meeting.id });
    if (!row) return null;
    const [record] = await loadMeetingDetails(
      this.database.db,
      organizationId,
      [meetingId],
    );
    return record ?? null;
  }
}
