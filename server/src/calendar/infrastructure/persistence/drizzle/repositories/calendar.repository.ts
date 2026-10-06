import { Injectable } from '@nestjs/common';

import { CalendarSchedulingContentionError } from '#server/calendar/domain/calendar.error.js';
import {
  type CalendarMeetingDetailRecord,
  type CalendarMeetingListRecord,
  CalendarRepository,
  type CalendarSchedulingConflict,
  type CancelMeetingsInput,
  type CreateMeetingRoomRecordInput,
  type EditMeetingDetailsInput,
  type FindParticipantBusyIntervalsInput,
  type FindRoomBusyIntervalsInput,
  type ListMeetingsInRangeInput,
  type ParticipantBusyInterval,
  type RecurrenceSeriesUpdateChanges,
  type ReplaceMeetingAttendeesInput,
  type ReplaceMeetingAttendeesResult,
  type RescheduleMeetingsInput,
  type RescheduleMeetingsResult,
  type RoomBusyInterval,
  type ScheduleMeetingInput,
  type ScheduleMeetingResult,
  type UpdateAttendeeRsvpResult,
  type UpdateMeetingRoomRecordInput,
} from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import {
  toMeetingDomain,
  toMeetingInsert,
  toMeetingUpdate,
} from '#server/calendar/infrastructure/persistence/drizzle/mappers/meeting.mapper.js';
import {
  toMeetingAttendeeDomain,
  toMeetingAttendeeInsert,
} from '#server/calendar/infrastructure/persistence/drizzle/mappers/meeting-attendee.mapper.js';
import {
  toMeetingRecurrenceSeriesDomain,
  toMeetingRecurrenceSeriesInsert,
  toMeetingRecurrenceSeriesUpdate,
} from '#server/calendar/infrastructure/persistence/drizzle/mappers/meeting-recurrence-series.mapper.js';
import {
  toMeetingRoomDomain,
  toMeetingRoomInsert,
  toMeetingRoomUpdate,
} from '#server/calendar/infrastructure/persistence/drizzle/mappers/meeting-room.mapper.js';
import { meeting } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting.schema.js';
import { meetingAttendee } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema.js';
import { meetingRecurrenceSeries } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema.js';
import { meetingRoom } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema.js';
import { DatabaseService } from '#server/database/database.service.js';

import {
  and,
  asc,
  count,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';

const serializableRetryCount = 3;
const attendeeInsertBatchSize = 1_000;

type CalendarTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];
type CalendarExecutor = DatabaseService['db'] | CalendarTransaction;

function escapeLikeSearchValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function exclusionCondition(
  column: typeof meeting.id,
  meetingIds: readonly string[] | undefined,
): SQL | undefined {
  if (!meetingIds || meetingIds.length === 0) return undefined;
  return notInArray(column, [...meetingIds]);
}

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
      'code' in current &&
      (current as { code?: unknown }).code === state
    ) {
      return true;
    }
    current =
      typeof current === 'object' && current !== null && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

@Injectable()
export class CalendarDrizzleRepository extends CalendarRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listMeetingsInRange(
    input: ListMeetingsInRangeInput,
  ): Promise<CalendarMeetingListRecord[]> {
    const conditions: SQL[] = [
      eq(meeting.organizationId, input.organizationId),
      lt(meeting.startAt, input.to),
      // 반열린 구간 [startAt, endAt) 기준으로 겹치는 회의를 조회한다.
      gt(meeting.endAt, input.from),
    ];

    if (input.category) conditions.push(eq(meeting.category, input.category));
    if (input.projectId)
      conditions.push(eq(meeting.projectId, input.projectId));
    if (input.roomId) conditions.push(eq(meeting.meetingRoomId, input.roomId));

    if (input.attendeeUserId) {
      const attendeeMeetingIds = this.database.db
        .select({ meetingId: meetingAttendee.meetingId })
        .from(meetingAttendee)
        .where(eq(meetingAttendee.userId, input.attendeeUserId));
      conditions.push(inArray(meeting.id, attendeeMeetingIds));
    }

    if (input.search) {
      const searchPattern = `%${escapeLikeSearchValue(input.search)}%`;
      const searchConditions: SQL[] = [
        ilike(meeting.title, searchPattern),
        ilike(meeting.locationText, searchPattern),
        ilike(meetingRoom.name, searchPattern),
      ];
      const participantUserIds = input.searchParticipantUserIds ?? [];
      if (participantUserIds.length > 0) {
        const participantMeetingIds = this.database.db
          .select({ meetingId: meetingAttendee.meetingId })
          .from(meetingAttendee)
          .where(inArray(meetingAttendee.userId, [...participantUserIds]));
        const participantCondition = or(
          inArray(meeting.organizerUserId, [...participantUserIds]),
          inArray(meeting.id, participantMeetingIds),
        );
        if (participantCondition) searchConditions.push(participantCondition);
      }
      const searchCondition = or(...searchConditions);
      if (searchCondition) conditions.push(searchCondition);
    }

    const rows = await this.database.db
      .select({ meeting, meetingRoom, recurrence: meetingRecurrenceSeries })
      .from(meeting)
      .leftJoin(
        meetingRoom,
        and(
          eq(meeting.meetingRoomId, meetingRoom.id),
          eq(meeting.organizationId, meetingRoom.organizationId),
        ),
      )
      .leftJoin(
        meetingRecurrenceSeries,
        and(
          eq(meeting.recurrenceSeriesId, meetingRecurrenceSeries.id),
          eq(meeting.organizationId, meetingRecurrenceSeries.organizationId),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(meeting.startAt), asc(meeting.id));

    if (rows.length === 0) return [];

    const meetingIds = rows.map((row) => row.meeting.id);
    const attendeeCounts = await this.database.db
      .select({ meetingId: meetingAttendee.meetingId, value: count() })
      .from(meetingAttendee)
      .where(inArray(meetingAttendee.meetingId, meetingIds))
      .groupBy(meetingAttendee.meetingId);
    const countsByMeetingId = new Map(
      attendeeCounts.map((item) => [item.meetingId, item.value]),
    );

    return rows.map((row) => ({
      meeting: toMeetingDomain(row.meeting),
      meetingRoom: row.meetingRoom
        ? toMeetingRoomDomain(row.meetingRoom)
        : null,
      recurrence: row.recurrence
        ? toMeetingRecurrenceSeriesDomain(row.recurrence)
        : null,
      attendeeCount: countsByMeetingId.get(row.meeting.id) ?? 0,
    }));
  }

  async findMeetingById(
    organizationId: string,
    meetingId: string,
  ): Promise<CalendarMeetingDetailRecord | null> {
    const records = await this.loadMeetingDetails(this.database.db, {
      organizationId,
      meetingIds: [meetingId],
    });
    return records[0] ?? null;
  }

  async listMeetingsInSeries(
    organizationId: string,
    recurrenceSeriesId: string,
  ): Promise<CalendarMeetingDetailRecord[]> {
    const records = await this.loadMeetingDetails(this.database.db, {
      organizationId,
      recurrenceSeriesId,
    });
    return records.sort(
      (left, right) =>
        (
          left.meeting.recurrenceOriginalStartAt ?? left.meeting.startAt
        ).getTime() -
        (
          right.meeting.recurrenceOriginalStartAt ?? right.meeting.startAt
        ).getTime(),
    );
  }

  findParticipantBusyIntervals(
    input: FindParticipantBusyIntervalsInput,
  ): Promise<ParticipantBusyInterval[]> {
    return this.findParticipantBusyIntervalsWithExecutor(
      this.database.db,
      input,
    );
  }

  findRoomBusyIntervals(
    input: FindRoomBusyIntervalsInput,
  ): Promise<RoomBusyInterval[]> {
    return this.findRoomBusyIntervalsWithExecutor(this.database.db, input);
  }

  async scheduleMeeting(
    input: ScheduleMeetingInput,
  ): Promise<ScheduleMeetingResult> {
    return this.runSerializable(async (transaction) => {
      if (
        !(await this.isMeetingRoomSelectable(
          transaction,
          input.template.organizationId,
          input.template.meetingRoomId,
        ))
      ) {
        return { status: 'room_unavailable' };
      }

      const attendeeUserIds = [...new Set(input.attendeeUserIds)].filter(
        (userId) => userId !== input.template.organizerUserId,
      );
      const participants = [input.template.organizerUserId, ...attendeeUserIds];
      const internalConflict = this.findCandidateConflict(
        input.occurrences.map((occurrence) => ({
          meetingId: '',
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          participantUserIds: participants,
          meetingRoomId: input.template.meetingRoomId,
        })),
      );
      if (internalConflict) return { status: 'conflict', ...internalConflict };

      for (const occurrence of input.occurrences) {
        const conflict = await this.findSchedulingConflict(transaction, {
          organizationId: input.template.organizationId,
          participantUserIds: participants,
          meetingRoomId: input.template.meetingRoomId,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
        });
        if (conflict) return { status: 'conflict', ...conflict };
      }

      const recurrenceSeriesId = input.recurrence
        ? await this.insertRecurrenceSeries(transaction, input.recurrence)
        : null;
      const insertedMeetings = await transaction
        .insert(meeting)
        .values(
          input.occurrences.map((occurrence) =>
            toMeetingInsert({
              ...input.template,
              startAt: occurrence.startAt,
              endAt: occurrence.endAt,
              recurrenceSeriesId,
              recurrenceOriginalStartAt: recurrenceSeriesId
                ? occurrence.recurrenceOriginalStartAt
                : null,
              iCalSequence: 0,
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

      const records = await this.loadMeetingDetails(transaction, {
        organizationId: input.template.organizationId,
        meetingIds: insertedMeetings.map((item) => item.id),
      });
      return { status: 'scheduled', records };
    });
  }

  async editMeetingDetails(
    input: EditMeetingDetailsInput,
  ): Promise<CalendarMeetingDetailRecord | null> {
    const [meetingRow] = await this.database.db
      .update(meeting)
      .set({
        ...toMeetingUpdate(input.changes),
        iCalSequence: sql`${meeting.iCalSequence} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(meeting.organizationId, input.organizationId),
          eq(meeting.id, input.meetingId),
        ),
      )
      .returning({ id: meeting.id });
    if (!meetingRow) return null;
    return this.findMeetingById(input.organizationId, input.meetingId);
  }

  async replaceMeetingAttendees(
    input: ReplaceMeetingAttendeesInput,
  ): Promise<ReplaceMeetingAttendeesResult> {
    return this.runSerializable(async (transaction) => {
      const current = await this.loadMeetingDetails(transaction, {
        organizationId: input.organizationId,
        meetingIds: [input.meetingId],
      });
      const record = current[0];
      if (!record) return { status: 'not_found' };
      if (record.meeting.canceledAt) return { status: 'canceled' };

      const conflictUserIds = [...new Set(input.conflictUserIds)].filter(
        (userId) => userId !== record.meeting.organizerUserId,
      );
      if (conflictUserIds.length > 0) {
        const participantConflicts =
          await this.findParticipantBusyIntervalsWithExecutor(transaction, {
            organizationId: input.organizationId,
            userIds: conflictUserIds,
            startAt: record.meeting.startAt,
            endAt: record.meeting.endAt,
            excludeMeetingIds: [input.meetingId],
          });
        if (participantConflicts.length > 0) {
          return {
            status: 'conflict',
            participantConflicts,
            roomConflict: null,
          };
        }
      }

      const attendeeUserIds = [...new Set(input.attendeeUserIds)].filter(
        (userId) => userId !== record.meeting.organizerUserId,
      );
      if (attendeeUserIds.length === 0) {
        await transaction
          .delete(meetingAttendee)
          .where(eq(meetingAttendee.meetingId, input.meetingId));
      } else {
        await transaction
          .delete(meetingAttendee)
          .where(
            and(
              eq(meetingAttendee.meetingId, input.meetingId),
              notInArray(meetingAttendee.userId, attendeeUserIds),
            ),
          );
        await transaction
          .insert(meetingAttendee)
          .values(
            attendeeUserIds.map((userId) =>
              toMeetingAttendeeInsert({
                meetingId: input.meetingId,
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
        .where(eq(meeting.id, input.meetingId));

      const updated = await this.loadMeetingDetails(transaction, {
        organizationId: input.organizationId,
        meetingIds: [input.meetingId],
      });
      const updatedRecord = updated[0];
      if (!updatedRecord) return { status: 'not_found' };
      return { status: 'updated', record: updatedRecord };
    });
  }

  async rescheduleMeetings(
    input: RescheduleMeetingsInput,
  ): Promise<RescheduleMeetingsResult> {
    return this.runSerializable(async (transaction) => {
      const meetingIds = input.updates.map((item) => item.meetingId);
      const current = await this.loadMeetingDetails(transaction, {
        organizationId: input.organizationId,
        meetingIds,
      });
      if (current.length !== meetingIds.length) return { status: 'not_found' };
      const allowedCanceledMeetingIds = new Set(
        input.allowedCanceledMeetingIds ?? [],
      );
      if (
        current.some(
          (record) =>
            record.meeting.canceledAt !== null &&
            !allowedCanceledMeetingIds.has(record.meeting.id),
        )
      ) {
        return { status: 'canceled' };
      }

      const currentById = new Map(
        current.map((record) => [record.meeting.id, record]),
      );
      const candidates = input.updates.flatMap((update) => {
        const record = currentById.get(update.meetingId);
        if (!record)
          throw new Error('reschedule 대상 회의를 찾을 수 없습니다.');
        if (record.meeting.canceledAt) return [];
        return [
          {
            meetingId: update.meetingId,
            startAt: update.startAt,
            endAt: update.endAt,
            participantUserIds: [
              record.meeting.organizerUserId,
              ...record.attendees
                .filter((item) => item.status !== 'declined')
                .map((item) => item.userId),
            ],
            meetingRoomId: update.meetingRoomId,
          },
        ];
      });
      const requestedRoomIds = new Set(
        candidates.flatMap((candidate) =>
          candidate.meetingRoomId ? [candidate.meetingRoomId] : [],
        ),
      );
      for (const meetingRoomId of requestedRoomIds) {
        if (
          !(await this.isMeetingRoomSelectable(
            transaction,
            input.organizationId,
            meetingRoomId,
          ))
        ) {
          return { status: 'room_unavailable' };
        }
      }

      const internalConflict = this.findCandidateConflict(candidates);
      if (internalConflict) return { status: 'conflict', ...internalConflict };

      for (const candidate of candidates) {
        const conflict = await this.findSchedulingConflict(transaction, {
          organizationId: input.organizationId,
          participantUserIds: candidate.participantUserIds,
          meetingRoomId: candidate.meetingRoomId,
          startAt: candidate.startAt,
          endAt: candidate.endAt,
          excludeMeetingIds: meetingIds,
        });
        if (conflict) return { status: 'conflict', ...conflict };
      }

      let splitSeriesId: string | null = null;
      if (input.recurrenceMutation?.kind === 'update') {
        await this.updateRecurrenceSeries(
          transaction,
          input.organizationId,
          input.recurrenceMutation.seriesId,
          input.recurrenceMutation.changes,
        );
      } else if (input.recurrenceMutation?.kind === 'split') {
        await this.updateRecurrenceSeries(
          transaction,
          input.organizationId,
          input.recurrenceMutation.sourceSeriesId,
          input.recurrenceMutation.sourceChanges,
        );
        splitSeriesId = await this.insertRecurrenceSeries(
          transaction,
          input.recurrenceMutation.create,
        );
      }

      for (const update of input.updates) {
        const shouldMoveToSplitSeries =
          input.recurrenceMutation?.kind === 'split' &&
          input.recurrenceMutation.meetingIds.includes(update.meetingId);
        await transaction
          .update(meeting)
          .set({
            startAt: update.startAt,
            endAt: update.endAt,
            timeZone: update.timeZone,
            locationType: update.locationType,
            meetingRoomId: update.meetingRoomId,
            locationText: update.locationText,
            recurrenceSeriesId: shouldMoveToSplitSeries
              ? splitSeriesId
              : undefined,
            recurrenceOriginalStartAt:
              update.recurrenceOriginalStartAt === undefined
                ? undefined
                : update.recurrenceOriginalStartAt,
            iCalSequence: sql`${meeting.iCalSequence} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(meeting.organizationId, input.organizationId),
              eq(meeting.id, update.meetingId),
            ),
          );
      }

      if (input.recurrenceMutation?.kind === 'split') {
        const sourceSeriesCondition = and(
          eq(meeting.organizationId, input.organizationId),
          eq(
            meeting.recurrenceSeriesId,
            input.recurrenceMutation.sourceSeriesId,
          ),
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
                eq(
                  meetingRecurrenceSeries.organizationId,
                  input.organizationId,
                ),
                eq(
                  meetingRecurrenceSeries.id,
                  input.recurrenceMutation.sourceSeriesId,
                ),
              ),
            );
        }
      }

      const records = await this.loadMeetingDetails(transaction, {
        organizationId: input.organizationId,
        meetingIds,
      });
      return { status: 'updated', records };
    });
  }

  async cancelMeetings(
    input: CancelMeetingsInput,
  ): Promise<CalendarMeetingDetailRecord[]> {
    const meetingIds = [...new Set(input.meetingIds)];
    if (meetingIds.length === 0) return [];
    return this.database.db.transaction(async (transaction) => {
      const now = new Date();
      await transaction
        .update(meeting)
        .set({
          canceledAt: now,
          canceledByUserId: input.canceledByUserId,
          cancelReason: input.cancelReason,
          iCalSequence: sql`${meeting.iCalSequence} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(meeting.organizationId, input.organizationId),
            inArray(meeting.id, meetingIds),
            isNull(meeting.canceledAt),
          ),
        );
      return this.loadMeetingDetails(transaction, {
        organizationId: input.organizationId,
        meetingIds,
      });
    });
  }

  async updateAttendeeRsvp(
    organizationId: string,
    meetingId: string,
    userId: string,
    status: 'accepted' | 'tentative' | 'declined',
  ): Promise<UpdateAttendeeRsvpResult> {
    return this.runSerializable(async (transaction) => {
      const [record] = await this.loadMeetingDetails(transaction, {
        organizationId,
        meetingIds: [meetingId],
      });
      if (!record) return { status: 'not_found' };
      if (record.meeting.canceledAt) return { status: 'canceled' };
      const currentAttendee = record.attendees.find(
        (attendee) => attendee.userId === userId,
      );
      if (!currentAttendee) return { status: 'not_attendee' };
      if (currentAttendee.status === status) {
        return { status: 'updated', attendee: currentAttendee };
      }

      if (status !== 'declined') {
        const participantConflicts =
          await this.findParticipantBusyIntervalsWithExecutor(transaction, {
            organizationId,
            userIds: [userId],
            startAt: record.meeting.startAt,
            endAt: record.meeting.endAt,
            excludeMeetingIds: [meetingId],
          });
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
        .set({ status, updatedAt: new Date() })
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

  async updateMeetingAgenda(
    organizationId: string,
    meetingId: string,
    agendaMarkdown: string,
  ): Promise<CalendarMeetingDetailRecord | null> {
    const [row] = await this.database.db
      .update(meeting)
      .set({
        agendaMarkdown,
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
    return row ? this.findMeetingById(organizationId, meetingId) : null;
  }

  async updateMeetingNotes(
    organizationId: string,
    meetingId: string,
    notesMarkdown: string,
  ): Promise<CalendarMeetingDetailRecord | null> {
    const [row] = await this.database.db
      .update(meeting)
      .set({ notesMarkdown, updatedAt: new Date() })
      .where(
        and(
          eq(meeting.organizationId, organizationId),
          eq(meeting.id, meetingId),
        ),
      )
      .returning({ id: meeting.id });
    return row ? this.findMeetingById(organizationId, meetingId) : null;
  }

  async listMeetingRooms(organizationId: string) {
    const rows = await this.database.db
      .select()
      .from(meetingRoom)
      .where(eq(meetingRoom.organizationId, organizationId))
      .orderBy(asc(meetingRoom.name), asc(meetingRoom.id));
    return rows.map(toMeetingRoomDomain);
  }

  async findMeetingRoomById(organizationId: string, meetingRoomId: string) {
    const [row] = await this.database.db
      .select()
      .from(meetingRoom)
      .where(
        and(
          eq(meetingRoom.organizationId, organizationId),
          eq(meetingRoom.id, meetingRoomId),
        ),
      )
      .limit(1);
    return row ? toMeetingRoomDomain(row) : null;
  }

  async createMeetingRoom(input: CreateMeetingRoomRecordInput) {
    const [row] = await this.database.db
      .insert(meetingRoom)
      .values(
        toMeetingRoomInsert({
          organizationId: input.organizationId,
          name: input.name,
          capacity: input.capacity,
          floor: input.floor,
          description: input.description,
          active: true,
        }),
      )
      .returning();
    if (!row) throw new Error('회의실 생성 결과가 없습니다.');
    return toMeetingRoomDomain(row);
  }

  async updateMeetingRoom(input: UpdateMeetingRoomRecordInput) {
    const [row] = await this.database.db
      .update(meetingRoom)
      .set(
        toMeetingRoomUpdate({
          ...input.changes,
          updatedAt: new Date(),
        }),
      )
      .where(
        and(
          eq(meetingRoom.organizationId, input.organizationId),
          eq(meetingRoom.id, input.meetingRoomId),
        ),
      )
      .returning();
    return row ? toMeetingRoomDomain(row) : null;
  }

  private async loadMeetingDetails(
    executor: CalendarExecutor,
    input: {
      organizationId: string;
      meetingIds?: readonly string[];
      recurrenceSeriesId?: string;
    },
  ): Promise<CalendarMeetingDetailRecord[]> {
    const conditions: SQL[] = [
      eq(meeting.organizationId, input.organizationId),
    ];
    if (input.meetingIds) {
      if (input.meetingIds.length === 0) return [];
      conditions.push(inArray(meeting.id, [...input.meetingIds]));
    }
    if (input.recurrenceSeriesId) {
      conditions.push(eq(meeting.recurrenceSeriesId, input.recurrenceSeriesId));
    }

    const rows = await executor
      .select({ meeting, meetingRoom, recurrence: meetingRecurrenceSeries })
      .from(meeting)
      .leftJoin(
        meetingRoom,
        and(
          eq(meeting.meetingRoomId, meetingRoom.id),
          eq(meeting.organizationId, meetingRoom.organizationId),
        ),
      )
      .leftJoin(
        meetingRecurrenceSeries,
        and(
          eq(meeting.recurrenceSeriesId, meetingRecurrenceSeries.id),
          eq(meeting.organizationId, meetingRecurrenceSeries.organizationId),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(meeting.startAt), asc(meeting.id));
    if (rows.length === 0) return [];

    const attendeeRows = await executor
      .select()
      .from(meetingAttendee)
      .where(
        inArray(
          meetingAttendee.meetingId,
          rows.map((row) => row.meeting.id),
        ),
      )
      .orderBy(asc(meetingAttendee.createdAt), asc(meetingAttendee.userId));
    const attendeesByMeetingId = new Map<string, typeof attendeeRows>();
    for (const attendee of attendeeRows) {
      const collection = attendeesByMeetingId.get(attendee.meetingId) ?? [];
      collection.push(attendee);
      attendeesByMeetingId.set(attendee.meetingId, collection);
    }

    return rows.map((row) => ({
      meeting: toMeetingDomain(row.meeting),
      meetingRoom: row.meetingRoom
        ? toMeetingRoomDomain(row.meetingRoom)
        : null,
      recurrence: row.recurrence
        ? toMeetingRecurrenceSeriesDomain(row.recurrence)
        : null,
      attendees: (attendeesByMeetingId.get(row.meeting.id) ?? []).map(
        toMeetingAttendeeDomain,
      ),
    }));
  }

  private async findParticipantBusyIntervalsWithExecutor(
    executor: CalendarExecutor,
    input: FindParticipantBusyIntervalsInput,
  ): Promise<ParticipantBusyInterval[]> {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) return [];
    const excluded = exclusionCondition(meeting.id, input.excludeMeetingIds);
    const baseConditions: SQL[] = [
      eq(meeting.organizationId, input.organizationId),
      isNull(meeting.canceledAt),
      lt(meeting.startAt, input.endAt),
      gt(meeting.endAt, input.startAt),
    ];
    if (excluded) baseConditions.push(excluded);

    const organizerRows = await executor
      .select({
        meetingId: meeting.id,
        userId: meeting.organizerUserId,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
      })
      .from(meeting)
      .where(and(...baseConditions, inArray(meeting.organizerUserId, userIds)));
    const attendeeRows = await executor
      .select({
        meetingId: meeting.id,
        userId: meetingAttendee.userId,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
      })
      .from(meeting)
      .innerJoin(meetingAttendee, eq(meeting.id, meetingAttendee.meetingId))
      .where(
        and(
          ...baseConditions,
          inArray(meetingAttendee.userId, userIds),
          ne(meetingAttendee.status, 'declined'),
        ),
      );

    const intervals = new Map<string, ParticipantBusyInterval>();
    for (const row of organizerRows) {
      intervals.set(`${row.meetingId}:${row.userId}`, {
        ...row,
        sourceType: 'organizer',
      });
    }
    for (const row of attendeeRows) {
      const key = `${row.meetingId}:${row.userId}`;
      if (!intervals.has(key)) {
        intervals.set(key, { ...row, sourceType: 'attendee' });
      }
    }
    return [...intervals.values()].sort(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    );
  }

  private async findRoomBusyIntervalsWithExecutor(
    executor: CalendarExecutor,
    input: FindRoomBusyIntervalsInput,
  ): Promise<RoomBusyInterval[]> {
    const conditions: SQL[] = [
      eq(meeting.organizationId, input.organizationId),
      eq(meeting.meetingRoomId, input.meetingRoomId),
      isNull(meeting.canceledAt),
      lt(meeting.startAt, input.endAt),
      gt(meeting.endAt, input.startAt),
    ];
    const excluded = exclusionCondition(meeting.id, input.excludeMeetingIds);
    if (excluded) conditions.push(excluded);
    const rows = await executor
      .select({
        meetingId: meeting.id,
        meetingRoomId: meeting.meetingRoomId,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
      })
      .from(meeting)
      .where(and(...conditions));
    return rows.flatMap((row) =>
      row.meetingRoomId
        ? [
            {
              meetingId: row.meetingId,
              meetingRoomId: row.meetingRoomId,
              startAt: row.startAt,
              endAt: row.endAt,
            },
          ]
        : [],
    );
  }

  private async isMeetingRoomSelectable(
    executor: CalendarExecutor,
    organizationId: string,
    meetingRoomId: string | null,
  ): Promise<boolean> {
    if (!meetingRoomId) return true;
    const [row] = await executor
      .select({ active: meetingRoom.active })
      .from(meetingRoom)
      .where(
        and(
          eq(meetingRoom.organizationId, organizationId),
          eq(meetingRoom.id, meetingRoomId),
        ),
      )
      .limit(1);
    return row?.active === true;
  }

  private async findSchedulingConflict(
    executor: CalendarExecutor,
    input: {
      organizationId: string;
      participantUserIds: readonly string[];
      meetingRoomId: string | null;
      startAt: Date;
      endAt: Date;
      excludeMeetingIds?: readonly string[];
    },
  ): Promise<CalendarSchedulingConflict | null> {
    const participantConflicts =
      await this.findParticipantBusyIntervalsWithExecutor(executor, {
        organizationId: input.organizationId,
        userIds: input.participantUserIds,
        startAt: input.startAt,
        endAt: input.endAt,
        excludeMeetingIds: input.excludeMeetingIds,
      });
    const roomConflicts = input.meetingRoomId
      ? await this.findRoomBusyIntervalsWithExecutor(executor, {
          organizationId: input.organizationId,
          meetingRoomId: input.meetingRoomId,
          startAt: input.startAt,
          endAt: input.endAt,
          excludeMeetingIds: input.excludeMeetingIds,
        })
      : [];
    if (participantConflicts.length === 0 && roomConflicts.length === 0) {
      return null;
    }
    return {
      participantConflicts,
      roomConflict: roomConflicts[0] ?? null,
    };
  }

  private findCandidateConflict(
    candidates: readonly {
      meetingId: string;
      startAt: Date;
      endAt: Date;
      participantUserIds: readonly string[];
      meetingRoomId: string | null;
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
    organizationId: string,
    seriesId: string,
    changes: RecurrenceSeriesUpdateChanges,
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
    input: ScheduleMeetingInput['recurrence'] extends infer Value
      ? Exclude<Value, null>
      : never,
  ): Promise<string> {
    const [row] = await transaction
      .insert(meetingRecurrenceSeries)
      .values(toMeetingRecurrenceSeriesInsert(input))
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
