import { Injectable } from '@nestjs/common';

import { CalendarSchedulingContentionError } from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import type { CancelMeetingInput } from '@/calendar/dto/cancel-meeting.dto';
import type { CreateMeetingInput } from '@/calendar/dto/create-meeting.dto';
import type { RescheduleMeetingInput } from '@/calendar/dto/reschedule-meeting.dto';
import type { CalendarSchedulingConflict } from '@/calendar/infrastructure/persistence/calendar-availability.repository';
import {
  CalendarSchedulingRepository,
  type RecurrenceSeriesMutation,
  type RescheduleMeetingsResult,
  type ScheduleMeetingResult,
} from '@/calendar/infrastructure/persistence/calendar-scheduling.repository';
import { toMeetingInsert } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting.mapper';
import { toMeetingAttendeeInsert } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-attendee.mapper';
import {
  toMeetingRecurrenceSeriesInsert,
  toMeetingRecurrenceSeriesUpdate,
} from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-recurrence-series.mapper';
import {
  findSchedulingConflict,
  isMeetingRoomSelectable,
  loadMeetingDetails,
} from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar-persistence.helpers';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { meetingAttendee } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema';
import { meetingRecurrenceSeries } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema';
import { DatabaseService } from '@/database/database.service';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

const serializableRetryCount = 3;
const attendeeInsertBatchSize = 1_000;

type CalendarTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

function intervalsOverlap(
  left: { startAt: Date; endAt: Date },
  right: { startAt: Date; endAt: Date },
): boolean {
  return left.startAt < right.endAt && left.endAt > right.startAt;
}

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
export class CalendarSchedulingDrizzleRepository extends CalendarSchedulingRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async scheduleMeeting(
    organizationId: Meeting['organizationId'],
    organizerUserId: Meeting['organizerUserId'],
    input: CreateMeetingInput,
    attendeeUserIdsInput: readonly MeetingAttendee['userId'][],
    occurrences: readonly Pick<
      Meeting,
      'startAt' | 'endAt' | 'recurrenceOriginalStartAt'
    >[],
    recurrence: Pick<
      MeetingRecurrenceSeries,
      'frequency' | 'interval' | 'count' | 'until' | 'byWeekday' | 'timeZone'
    > | null,
    iCalUid: Meeting['iCalUid'],
  ): Promise<ScheduleMeetingResult> {
    return this.runSerializable(async (transaction) => {
      const meetingRoomId = input.meetingRoomId ?? null;
      if (
        !(await isMeetingRoomSelectable(
          transaction,
          organizationId,
          meetingRoomId,
        ))
      ) {
        return { status: 'room_unavailable' };
      }

      const attendeeUserIds = [...new Set(attendeeUserIdsInput)];
      const participants = attendeeUserIds;
      const internalConflict = this.findCandidateConflict(
        occurrences.map((occurrence) => ({
          meetingId: '',
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          participantUserIds: participants,
          meetingRoomId,
        })),
      );
      if (internalConflict) return { status: 'conflict', ...internalConflict };

      for (const occurrence of occurrences) {
        const conflict = await findSchedulingConflict(
          transaction,
          organizationId,
          participants,
          meetingRoomId,
          occurrence.startAt,
          occurrence.endAt,
        );
        if (conflict) return { status: 'conflict', ...conflict };
      }

      const recurrenceSeriesId = recurrence
        ? await this.insertRecurrenceSeries(
            transaction,
            organizationId,
            recurrence,
          )
        : null;
      const insertedMeetings = await transaction
        .insert(meeting)
        .values(
          occurrences.map((occurrence) =>
            toMeetingInsert({
              organizationId,
              projectId: input.projectId ?? null,
              organizerUserId,
              title: input.title,
              category: input.category,
              startAt: occurrence.startAt,
              endAt: occurrence.endAt,
              timeZone: input.timeZone,
              locationType: input.locationType,
              meetingRoomId,
              locationText: input.locationText ?? null,
              agendaMarkdown: input.agendaMarkdown ?? '',
              notesMarkdown: input.notesMarkdown ?? '',
              reminderMinutes: input.reminderMinutes ?? null,
              iCalUid,
              iCalSequence: 0,
              recurrenceSeriesId,
              recurrenceOriginalStartAt: recurrenceSeriesId
                ? occurrence.recurrenceOriginalStartAt
                : null,
              canceledAt: null,
              canceledByUserId: null,
              cancelReason: null,
            }),
          ),
        )
        .returning();

      if (attendeeUserIds.length > 0) {
        let batch: ReturnType<typeof toMeetingAttendeeInsert>[] = [];
        for (const meetingRow of insertedMeetings) {
          for (const userId of attendeeUserIds) {
            batch.push(
              toMeetingAttendeeInsert({
                meetingId: meetingRow.id,
                userId,
                status: 'pending',
              }),
            );
            if (batch.length >= attendeeInsertBatchSize) {
              await transaction.insert(meetingAttendee).values(batch);
              batch = [];
            }
          }
        }
        if (batch.length > 0) {
          await transaction.insert(meetingAttendee).values(batch);
        }
      }

      const records = await loadMeetingDetails(
        transaction,
        organizationId,
        insertedMeetings.map((item) => item.id),
      );
      return { status: 'scheduled', records };
    });
  }

  async rescheduleMeetings(
    organizationId: Meeting['organizationId'],
    input: RescheduleMeetingInput,
    updates: readonly (Pick<Meeting, 'id' | 'startAt' | 'endAt'> &
      Partial<Pick<Meeting, 'recurrenceOriginalStartAt'>>)[],
    allowedCanceledMeetingIds: readonly Meeting['id'][],
    recurrenceMutation?: RecurrenceSeriesMutation,
  ): Promise<RescheduleMeetingsResult> {
    return this.runSerializable(async (transaction) => {
      const meetingIds = updates.map((item) => item.id);
      const current = await loadMeetingDetails(
        transaction,
        organizationId,
        meetingIds,
      );
      if (current.length !== meetingIds.length) return { status: 'not_found' };
      const allowedCanceledIds = new Set(allowedCanceledMeetingIds);
      if (
        current.some(
          (record) =>
            record.meeting.canceledAt !== null &&
            !allowedCanceledIds.has(record.meeting.id),
        )
      ) {
        return { status: 'canceled' };
      }

      const currentById = new Map(
        current.map((record) => [record.meeting.id, record]),
      );
      const meetingRoomId = input.meetingRoomId;
      const candidates = updates.flatMap((update) => {
        const record = currentById.get(update.id);
        if (!record)
          throw new Error('reschedule 대상 회의를 찾을 수 없습니다.');
        if (record.meeting.canceledAt) return [];
        return [
          {
            meetingId: update.id,
            startAt: update.startAt,
            endAt: update.endAt,
            participantUserIds: [
              ...record.attendees
                .filter((item) => item.status !== 'declined')
                .map((item) => item.userId),
            ],
            meetingRoomId,
          },
        ];
      });

      if (
        candidates.length > 0 &&
        meetingRoomId &&
        !(await isMeetingRoomSelectable(
          transaction,
          organizationId,
          meetingRoomId,
        ))
      ) {
        return { status: 'room_unavailable' };
      }

      const internalConflict = this.findCandidateConflict(candidates);
      if (internalConflict) return { status: 'conflict', ...internalConflict };

      for (const candidate of candidates) {
        const conflict = await findSchedulingConflict(
          transaction,
          organizationId,
          candidate.participantUserIds,
          candidate.meetingRoomId,
          candidate.startAt,
          candidate.endAt,
          meetingIds,
        );
        if (conflict) return { status: 'conflict', ...conflict };
      }

      let splitSeriesId: string | null = null;
      if (recurrenceMutation?.kind === 'update') {
        await this.updateRecurrenceSeries(
          transaction,
          organizationId,
          recurrenceMutation.seriesId,
          recurrenceMutation.changes,
        );
      } else if (recurrenceMutation?.kind === 'split') {
        await this.updateRecurrenceSeries(
          transaction,
          organizationId,
          recurrenceMutation.sourceSeriesId,
          recurrenceMutation.sourceChanges,
        );
        splitSeriesId = await this.insertRecurrenceSeries(
          transaction,
          organizationId,
          recurrenceMutation.create,
        );
      }

      for (const update of updates) {
        const shouldMoveToSplitSeries =
          recurrenceMutation?.kind === 'split' &&
          recurrenceMutation.meetingIds.includes(update.id);
        await transaction
          .update(meeting)
          .set({
            startAt: update.startAt,
            endAt: update.endAt,
            timeZone: input.timeZone,
            locationType: input.locationType,
            meetingRoomId,
            locationText: input.locationText,
            recurrenceSeriesId: shouldMoveToSplitSeries
              ? splitSeriesId
              : undefined,
            recurrenceOriginalStartAt: update.recurrenceOriginalStartAt,
            iCalSequence: sql`${meeting.iCalSequence} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(meeting.organizationId, organizationId),
              eq(meeting.id, update.id),
            ),
          );
      }

      if (recurrenceMutation?.kind === 'split') {
        const sourceSeriesCondition = and(
          eq(meeting.organizationId, organizationId),
          eq(meeting.recurrenceSeriesId, recurrenceMutation.sourceSeriesId),
        );
        await transaction
          .update(meeting)
          .set({
            iCalSequence: sql`${meeting.iCalSequence} + 1`,
            updatedAt: new Date(),
          })
          .where(sourceSeriesCondition);

        const [remaining] = await transaction
          .select({ id: meeting.id })
          .from(meeting)
          .where(sourceSeriesCondition)
          .limit(1);
        if (!remaining) {
          await transaction
            .delete(meetingRecurrenceSeries)
            .where(
              and(
                eq(meetingRecurrenceSeries.organizationId, organizationId),
                eq(
                  meetingRecurrenceSeries.id,
                  recurrenceMutation.sourceSeriesId,
                ),
              ),
            );
        }
      }

      const records = await loadMeetingDetails(
        transaction,
        organizationId,
        meetingIds,
      );
      return { status: 'updated', records };
    });
  }

  async cancelMeetings(
    organizationId: Meeting['organizationId'],
    meetingIdsInput: readonly Meeting['id'][],
    canceledByUserId: Exclude<Meeting['canceledByUserId'], null>,
    input: CancelMeetingInput,
  ) {
    const meetingIds = [...new Set(meetingIdsInput)];
    if (meetingIds.length === 0) return [];
    return this.database.db.transaction(async (transaction) => {
      const now = new Date();
      await transaction
        .update(meeting)
        .set({
          canceledAt: now,
          canceledByUserId,
          cancelReason: input.reason,
          iCalSequence: sql`${meeting.iCalSequence} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(meeting.organizationId, organizationId),
            inArray(meeting.id, meetingIds),
            isNull(meeting.canceledAt),
          ),
        );
      return loadMeetingDetails(transaction, organizationId, meetingIds);
    });
  }

  private findCandidateConflict(
    candidates: readonly {
      meetingId: Meeting['id'];
      startAt: Meeting['startAt'];
      endAt: Meeting['endAt'];
      participantUserIds: readonly MeetingAttendee['userId'][];
      meetingRoomId: Meeting['meetingRoomId'];
    }[],
  ): CalendarSchedulingConflict | null {
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      const left = candidates[leftIndex];
      if (!left) continue;
      const leftUsers = new Set(left.participantUserIds);
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < candidates.length;
        rightIndex += 1
      ) {
        const right = candidates[rightIndex];
        if (!right || !intervalsOverlap(left, right)) continue;
        const commonUser = right.participantUserIds.find((userId) =>
          leftUsers.has(userId),
        );
        if (commonUser) {
          return {
            participantConflicts: [
              {
                meetingId: right.meetingId,
                userId: commonUser,
                startAt: right.startAt,
                endAt: right.endAt,
                sourceType: 'attendee',
              },
            ],
            roomConflict: null,
          };
        }
        if (left.meetingRoomId && right.meetingRoomId === left.meetingRoomId) {
          return {
            participantConflicts: [],
            roomConflict: {
              meetingId: right.meetingId,
              meetingRoomId: left.meetingRoomId,
              startAt: right.startAt,
              endAt: right.endAt,
            },
          };
        }
      }
    }
    return null;
  }

  private async updateRecurrenceSeries(
    transaction: CalendarTransaction,
    organizationId: Meeting['organizationId'],
    seriesId: MeetingRecurrenceSeries['id'],
    changes: Partial<
      Pick<
        MeetingRecurrenceSeries,
        'count' | 'until' | 'timeZone' | 'byWeekday'
      >
    >,
  ): Promise<void> {
    await transaction
      .update(meetingRecurrenceSeries)
      .set(
        toMeetingRecurrenceSeriesUpdate({
          ...changes,
          updatedAt: new Date(),
        }),
      )
      .where(
        and(
          eq(meetingRecurrenceSeries.organizationId, organizationId),
          eq(meetingRecurrenceSeries.id, seriesId),
        ),
      );
  }

  private async insertRecurrenceSeries(
    transaction: CalendarTransaction,
    organizationId: Meeting['organizationId'],
    input: Pick<
      MeetingRecurrenceSeries,
      'frequency' | 'interval' | 'count' | 'until' | 'byWeekday' | 'timeZone'
    >,
  ): Promise<MeetingRecurrenceSeries['id']> {
    const [row] = await transaction
      .insert(meetingRecurrenceSeries)
      .values(toMeetingRecurrenceSeriesInsert({ organizationId, ...input }))
      .returning({ id: meetingRecurrenceSeries.id });
    if (!row) throw new Error('반복 일정 series 생성 결과가 없습니다.');
    return row.id;
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
