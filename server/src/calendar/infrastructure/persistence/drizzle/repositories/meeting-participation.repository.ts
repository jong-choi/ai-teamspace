import { Injectable } from '@nestjs/common';

import { CalendarSchedulingContentionError } from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { RsvpMeetingInput } from '@/calendar/dto/rsvp-meeting.dto';
import type { UpdateMeetingAttendeesInput } from '@/calendar/dto/update-meeting-attendees.dto';
import {
  toMeetingAttendeeDomain,
  toMeetingAttendeeInsert,
} from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-attendee.mapper';
import {
  findParticipantBusyIntervals,
  loadMeetingDetails,
} from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar-persistence.helpers';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { meetingAttendee } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema';
import {
  MeetingParticipationRepository,
  type ReplaceMeetingAttendeesResult,
  type UpdateAttendeeRsvpResult,
} from '@/calendar/infrastructure/persistence/meeting-participation.repository';
import { DatabaseService } from '@/database/database.service';

import { and, eq, notInArray, sql } from 'drizzle-orm';

const serializableRetryCount = 3;

type CalendarTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

function hasSqlState(error: unknown, state: string): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (
      typeof current === 'object' &&
      current !== null &&
      'code' in current &&
      current.code === state
    ) {
      return true;
    }
    current =
      typeof current === 'object' && current !== null && 'cause' in current
        ? current.cause
        : undefined;
  }
  return false;
}

@Injectable()
export class MeetingParticipationDrizzleRepository extends MeetingParticipationRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async replaceMeetingAttendees(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: UpdateMeetingAttendeesInput,
    conflictUserIdsInput: readonly MeetingAttendee['userId'][],
  ): Promise<ReplaceMeetingAttendeesResult> {
    return this.runSerializable(async (transaction) => {
      const current = await loadMeetingDetails(transaction, organizationId, [
        meetingId,
      ]);
      const record = current[0];
      if (!record) return { status: 'not_found' };
      if (record.meeting.canceledAt) return { status: 'canceled' };

      const conflictUserIds = [...new Set(conflictUserIdsInput)];
      if (conflictUserIds.length > 0) {
        const participantConflicts = await findParticipantBusyIntervals(
          transaction,
          organizationId,
          conflictUserIds,
          record.meeting.startAt,
          record.meeting.endAt,
          [meetingId],
        );
        if (participantConflicts.length > 0) {
          return {
            status: 'conflict',
            participantConflicts,
            roomConflict: null,
          };
        }
      }

      const attendeeUserIds = [...new Set(input.attendeeUserIds)];
      if (attendeeUserIds.length === 0) {
        await transaction
          .delete(meetingAttendee)
          .where(eq(meetingAttendee.meetingId, meetingId));
      } else {
        await transaction
          .delete(meetingAttendee)
          .where(
            and(
              eq(meetingAttendee.meetingId, meetingId),
              notInArray(meetingAttendee.userId, attendeeUserIds),
            ),
          );
        await transaction
          .insert(meetingAttendee)
          .values(
            attendeeUserIds.map((userId) =>
              toMeetingAttendeeInsert({
                meetingId,
                userId,
                status: 'pending',
              }),
            ),
          )
          .onConflictDoNothing();
      }
      await transaction
        .update(meeting)
        .set({
          iCalSequence: sql`${meeting.iCalSequence} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(meeting.id, meetingId));

      const updated = await loadMeetingDetails(transaction, organizationId, [
        meetingId,
      ]);
      const updatedRecord = updated[0];
      if (!updatedRecord) return { status: 'not_found' };
      return { status: 'updated', record: updatedRecord };
    });
  }

  async updateAttendeeRsvp(
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    userId: MeetingAttendee['userId'],
    input: RsvpMeetingInput,
  ): Promise<UpdateAttendeeRsvpResult> {
    return this.runSerializable(async (transaction) => {
      const [record] = await loadMeetingDetails(transaction, organizationId, [
        meetingId,
      ]);
      if (!record) return { status: 'not_found' };
      if (record.meeting.canceledAt) return { status: 'canceled' };
      const currentAttendee = record.attendees.find(
        (attendee) => attendee.userId === userId,
      );
      if (!currentAttendee) return { status: 'not_attendee' };
      if (currentAttendee.status === input.status) {
        return { status: 'updated', attendee: currentAttendee };
      }

      if (input.status !== 'declined') {
        const participantConflicts = await findParticipantBusyIntervals(
          transaction,
          organizationId,
          [userId],
          record.meeting.startAt,
          record.meeting.endAt,
          [meetingId],
        );
        if (participantConflicts.length > 0) {
          return {
            status: 'conflict',
            participantConflicts,
            roomConflict: null,
          };
        }
      }

      const [row] = await transaction
        .update(meetingAttendee)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(meetingAttendee.meetingId, meetingId),
            eq(meetingAttendee.userId, userId),
          ),
        )
        .returning();
      if (!row) return { status: 'not_attendee' };
      await transaction
        .update(meeting)
        .set({
          iCalSequence: sql`${meeting.iCalSequence} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(meeting.organizationId, organizationId),
            eq(meeting.id, meetingId),
          ),
        );
      return { status: 'updated', attendee: toMeetingAttendeeDomain(row) };
    });
  }

  private async runSerializable<T>(
    work: (transaction: CalendarTransaction) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < serializableRetryCount; attempt += 1) {
      try {
        return await this.database.db.transaction(work, {
          isolationLevel: 'serializable',
          accessMode: 'read write',
        });
      } catch (error) {
        lastError = error;
        if (!hasSqlState(error, '40001')) throw error;
      }
    }
    throw new CalendarSchedulingContentionError({ cause: lastError });
  }
}
