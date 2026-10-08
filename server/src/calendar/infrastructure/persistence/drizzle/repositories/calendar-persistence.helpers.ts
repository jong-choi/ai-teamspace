import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import type { MeetingRoom } from '@/calendar/domain/meeting-room';
import type {
  CalendarSchedulingConflict,
  ParticipantBusyInterval,
  RoomBusyInterval,
} from '@/calendar/infrastructure/persistence/calendar-availability.repository';
import type { CalendarMeetingDetailRecord } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { toMeetingDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting.mapper';
import { toMeetingAttendeeDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-attendee.mapper';
import { toMeetingRecurrenceSeriesDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-recurrence-series.mapper';
import { toMeetingRoomDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-room.mapper';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { meetingAttendee } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema';
import { meetingRecurrenceSeries } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema';
import { meetingRoom } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema';
import type { DatabaseService } from '@/database/database.service';

import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
  type SQL,
} from 'drizzle-orm';

type CalendarTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

export type CalendarExecutor = DatabaseService['db'] | CalendarTransaction;

function exclusionCondition(
  meetingIds: readonly Meeting['id'][] | undefined,
): SQL | undefined {
  if (!meetingIds || meetingIds.length === 0) return undefined;
  return notInArray(meeting.id, [...meetingIds]);
}

export async function loadMeetingDetails(
  executor: CalendarExecutor,
  organizationId: Meeting['organizationId'],
  meetingIds?: readonly Meeting['id'][],
  recurrenceSeriesId?: MeetingRecurrenceSeries['id'],
): Promise<CalendarMeetingDetailRecord[]> {
  const conditions: SQL[] = [eq(meeting.organizationId, organizationId)];
  if (meetingIds) {
    if (meetingIds.length === 0) return [];
    conditions.push(inArray(meeting.id, [...meetingIds]));
  }
  if (recurrenceSeriesId) {
    conditions.push(eq(meeting.recurrenceSeriesId, recurrenceSeriesId));
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
  const attendeesByMeetingId = new Map<Meeting['id'], typeof attendeeRows>();
  for (const attendee of attendeeRows) {
    const collection = attendeesByMeetingId.get(attendee.meetingId) ?? [];
    collection.push(attendee);
    attendeesByMeetingId.set(attendee.meetingId, collection);
  }

  return rows.map((row) => ({
    meeting: toMeetingDomain(row.meeting),
    meetingRoom: row.meetingRoom ? toMeetingRoomDomain(row.meetingRoom) : null,
    recurrence: row.recurrence
      ? toMeetingRecurrenceSeriesDomain(row.recurrence)
      : null,
    attendees: (attendeesByMeetingId.get(row.meeting.id) ?? []).map(
      toMeetingAttendeeDomain,
    ),
  }));
}

export async function findParticipantBusyIntervals(
  executor: CalendarExecutor,
  organizationId: Meeting['organizationId'],
  userIds: readonly MeetingAttendee['userId'][],
  startAt: Meeting['startAt'],
  endAt: Meeting['endAt'],
  excludeMeetingIds?: readonly Meeting['id'][],
): Promise<ParticipantBusyInterval[]> {
  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) return [];

  const baseConditions: SQL[] = [
    eq(meeting.organizationId, organizationId),
    isNull(meeting.canceledAt),
    lt(meeting.startAt, endAt),
    gt(meeting.endAt, startAt),
  ];
  const excluded = exclusionCondition(excludeMeetingIds);
  if (excluded) baseConditions.push(excluded);

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
        inArray(meetingAttendee.userId, uniqueUserIds),
        ne(meetingAttendee.status, 'declined'),
      ),
    );

  const intervals = new Map<string, ParticipantBusyInterval>();
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

export async function findRoomBusyIntervals(
  executor: CalendarExecutor,
  organizationId: Meeting['organizationId'],
  meetingRoomId: MeetingRoom['id'],
  startAt: Meeting['startAt'],
  endAt: Meeting['endAt'],
  excludeMeetingIds?: readonly Meeting['id'][],
): Promise<RoomBusyInterval[]> {
  const conditions: SQL[] = [
    eq(meeting.organizationId, organizationId),
    eq(meeting.meetingRoomId, meetingRoomId),
    isNull(meeting.canceledAt),
    lt(meeting.startAt, endAt),
    gt(meeting.endAt, startAt),
  ];
  const excluded = exclusionCondition(excludeMeetingIds);
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

export async function isMeetingRoomSelectable(
  executor: CalendarExecutor,
  organizationId: Meeting['organizationId'],
  meetingRoomId: Meeting['meetingRoomId'],
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

export async function findSchedulingConflict(
  executor: CalendarExecutor,
  organizationId: Meeting['organizationId'],
  participantUserIds: readonly MeetingAttendee['userId'][],
  meetingRoomId: Meeting['meetingRoomId'],
  startAt: Meeting['startAt'],
  endAt: Meeting['endAt'],
  excludeMeetingIds?: readonly Meeting['id'][],
): Promise<CalendarSchedulingConflict | null> {
  const participantConflicts = await findParticipantBusyIntervals(
    executor,
    organizationId,
    participantUserIds,
    startAt,
    endAt,
    excludeMeetingIds,
  );
  const roomConflicts = meetingRoomId
    ? await findRoomBusyIntervals(
        executor,
        organizationId,
        meetingRoomId,
        startAt,
        endAt,
        excludeMeetingIds,
      )
    : [];
  if (participantConflicts.length === 0 && roomConflicts.length === 0) {
    return null;
  }
  return {
    participantConflicts,
    roomConflict: roomConflicts[0] ?? null,
  };
}
