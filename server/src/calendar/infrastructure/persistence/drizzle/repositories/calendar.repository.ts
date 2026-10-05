import { Injectable } from '@nestjs/common';

import {
  type CalendarMeetingDetailRecord,
  type CalendarMeetingListRecord,
  CalendarRepository,
  type CreateMeetingRoomRecordInput,
  type CreateMeetingWithAttendeesInput,
  type EditMeetingDetailsInput,
  type ListMeetingsInRangeInput,
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
  toMeetingRoomDomain,
  toMeetingRoomInsert,
  toMeetingRoomUpdate,
} from '#server/calendar/infrastructure/persistence/drizzle/mappers/meeting-room.mapper.js';
import { meeting } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting.schema.js';
import { meetingAttendee } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema.js';
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
  lt,
  notInArray,
  or,
  type SQL,
} from 'drizzle-orm';

function escapeLikeSearchValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
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
      .select({ meeting, meetingRoom })
      .from(meeting)
      .leftJoin(
        meetingRoom,
        and(
          eq(meeting.meetingRoomId, meetingRoom.id),
          eq(meeting.organizationId, meetingRoom.organizationId),
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
      attendeeCount: countsByMeetingId.get(row.meeting.id) ?? 0,
    }));
  }

  async findMeetingById(
    organizationId: string,
    meetingId: string,
  ): Promise<CalendarMeetingDetailRecord | null> {
    const [row] = await this.database.db
      .select({ meeting, meetingRoom })
      .from(meeting)
      .leftJoin(
        meetingRoom,
        and(
          eq(meeting.meetingRoomId, meetingRoom.id),
          eq(meeting.organizationId, meetingRoom.organizationId),
        ),
      )
      .where(
        and(
          eq(meeting.organizationId, organizationId),
          eq(meeting.id, meetingId),
        ),
      )
      .limit(1);

    if (!row) return null;

    const attendeeRows = await this.database.db
      .select()
      .from(meetingAttendee)
      .where(eq(meetingAttendee.meetingId, meetingId))
      .orderBy(asc(meetingAttendee.createdAt), asc(meetingAttendee.userId));

    return {
      meeting: toMeetingDomain(row.meeting),
      meetingRoom: row.meetingRoom
        ? toMeetingRoomDomain(row.meetingRoom)
        : null,
      attendees: attendeeRows.map(toMeetingAttendeeDomain),
    };
  }

  async createMeetingWithAttendees(
    input: CreateMeetingWithAttendeesInput,
  ): Promise<CalendarMeetingDetailRecord> {
    return this.database.db.transaction(async (transaction) => {
      const [meetingRow] = await transaction
        .insert(meeting)
        .values(
          toMeetingInsert({
            organizationId: input.organizationId,
            projectId: input.projectId,
            organizerUserId: input.organizerUserId,
            title: input.title,
            category: input.category,
            startAt: input.startAt,
            endAt: input.endAt,
            timeZone: input.timeZone,
            locationType: input.locationType,
            meetingRoomId: input.meetingRoomId,
            locationText: input.locationText,
            agendaMarkdown: input.agendaMarkdown,
            notesMarkdown: input.notesMarkdown,
            reminderMinutes: input.reminderMinutes,
            canceledAt: null,
          }),
        )
        .returning();

      if (!meetingRow) {
        throw new Error('회의 생성 결과가 없습니다.');
      }

      const attendeeUserIds = [...new Set(input.attendeeUserIds)];
      let attendeeRows: (typeof meetingAttendee.$inferSelect)[] = [];
      if (attendeeUserIds.length > 0) {
        attendeeRows = await transaction
          .insert(meetingAttendee)
          .values(
            attendeeUserIds.map((userId) =>
              toMeetingAttendeeInsert({
                meetingId: meetingRow.id,
                userId,
                status: 'pending',
              }),
            ),
          )
          .returning();
      }

      const room = meetingRow.meetingRoomId
        ? await transaction
            .select()
            .from(meetingRoom)
            .where(
              and(
                eq(meetingRoom.organizationId, input.organizationId),
                eq(meetingRoom.id, meetingRow.meetingRoomId),
              ),
            )
            .limit(1)
        : [];

      return {
        meeting: toMeetingDomain(meetingRow),
        meetingRoom: room[0] ? toMeetingRoomDomain(room[0]) : null,
        attendees: attendeeRows.map(toMeetingAttendeeDomain),
      };
    });
  }

  async editMeetingDetails(
    input: EditMeetingDetailsInput,
  ): Promise<CalendarMeetingDetailRecord | null> {
    return this.database.db.transaction(async (transaction) => {
      const shouldTouchMeeting =
        Object.keys(input.changes).length > 0 ||
        input.attendeeUserIds !== undefined;
      const [meetingRow] = shouldTouchMeeting
        ? await transaction
            .update(meeting)
            .set(
              toMeetingUpdate({
                ...input.changes,
                updatedAt: new Date(),
              }),
            )
            .where(
              and(
                eq(meeting.organizationId, input.organizationId),
                eq(meeting.id, input.meetingId),
              ),
            )
            .returning()
        : await transaction
            .select()
            .from(meeting)
            .where(
              and(
                eq(meeting.organizationId, input.organizationId),
                eq(meeting.id, input.meetingId),
              ),
            )
            .limit(1);

      if (!meetingRow) return null;

      if (input.attendeeUserIds !== undefined) {
        const attendeeUserIds = [...new Set(input.attendeeUserIds)];
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
      }

      const attendeeRows = await transaction
        .select()
        .from(meetingAttendee)
        .where(eq(meetingAttendee.meetingId, input.meetingId))
        .orderBy(asc(meetingAttendee.createdAt), asc(meetingAttendee.userId));
      const room = meetingRow.meetingRoomId
        ? await transaction
            .select()
            .from(meetingRoom)
            .where(
              and(
                eq(meetingRoom.organizationId, input.organizationId),
                eq(meetingRoom.id, meetingRow.meetingRoomId),
              ),
            )
            .limit(1)
        : [];

      return {
        meeting: toMeetingDomain(meetingRow),
        meetingRoom: room[0] ? toMeetingRoomDomain(room[0]) : null,
        attendees: attendeeRows.map(toMeetingAttendeeDomain),
      };
    });
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
}
