import { Injectable } from '@nestjs/common';

import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import {
  type CalendarMeetingDetailRecord,
  type CalendarMeetingListRecord,
  CalendarMeetingQueryRepository,
} from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { loadMeetingDetails } from '@/calendar/infrastructure/persistence/drizzle/repositories/calendar-persistence.helpers';
import { toMeetingDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting.mapper';
import { toMeetingRecurrenceSeriesDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-recurrence-series.mapper';
import { toMeetingRoomDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-room.mapper';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { meetingAttendee } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema';
import { meetingRecurrenceSeries } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema';
import { meetingRoom } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema';
import { DatabaseService } from '@/database/database.service';

import {
  and,
  asc,
  count,
  eq,
  gt,
  ilike,
  inArray,
  lt,
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
export class CalendarMeetingQueryDrizzleRepository extends CalendarMeetingQueryRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listMeetingsInRange(
    input: Parameters<CalendarMeetingQueryRepository['listMeetingsInRange']>[0],
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
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
  ): Promise<CalendarMeetingDetailRecord | null> {
    const records = await loadMeetingDetails(this.database.db, organizationId, [
      meetingId,
    ]);
    return records[0] ?? null;
  }

  async listMeetingsInSeries(
    organizationId: Meeting['organizationId'],
    recurrenceSeriesId: MeetingRecurrenceSeries['id'],
  ): Promise<CalendarMeetingDetailRecord[]> {
    const records = await loadMeetingDetails(
      this.database.db,
      organizationId,
      undefined,
      recurrenceSeriesId,
    );
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
}
