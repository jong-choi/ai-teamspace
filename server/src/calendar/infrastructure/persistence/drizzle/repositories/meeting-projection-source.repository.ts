import { Injectable } from '@nestjs/common';

import { MeetingGraphSourceSchema } from '@/calendar/domain/meeting-graph-source';
import { MeetingProjectionSourceSchema } from '@/calendar/domain/meeting-projection-source';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { meetingAttendee } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema';
import { meetingRecurrenceSeries } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema';
import { meetingRoom } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema';
import { MeetingProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-projection-source.repository';
import { DatabaseService } from '@/database/database.service';
import { toLikeContainsPattern } from '@/utils/like-pattern';

import { and, asc, eq, gt, ilike, inArray, or } from 'drizzle-orm';

@Injectable()
export class MeetingProjectionSourceDrizzleRepository extends MeetingProjectionSourceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async current(organizationId: string, meetingId: string) {
    return this.database.db.transaction(
      async (transaction) => {
        const [row] = await transaction
          .select({
            meeting: {
              id: meeting.id,
              organizationId: meeting.organizationId,
              projectId: meeting.projectId,
              organizerUserId: meeting.organizerUserId,
              title: meeting.title,
              category: meeting.category,
              startAt: meeting.startAt,
              endAt: meeting.endAt,
              timeZone: meeting.timeZone,
              locationType: meeting.locationType,
              meetingRoomId: meeting.meetingRoomId,
              locationText: meeting.locationText,
              reminderMinutes: meeting.reminderMinutes,
              recurrenceSeriesId: meeting.recurrenceSeriesId,
              recurrenceOriginalStartAt: meeting.recurrenceOriginalStartAt,
              canceledAt: meeting.canceledAt,
              updatedAt: meeting.updatedAt,
            },
            room: {
              id: meetingRoom.id,
              name: meetingRoom.name,
              capacity: meetingRoom.capacity,
              floor: meetingRoom.floor,
              active: meetingRoom.active,
            },
            recurrence: {
              id: meetingRecurrenceSeries.id,
              frequency: meetingRecurrenceSeries.frequency,
              interval: meetingRecurrenceSeries.interval,
              count: meetingRecurrenceSeries.count,
              until: meetingRecurrenceSeries.until,
              timeZone: meetingRecurrenceSeries.timeZone,
            },
          })
          .from(meeting)
          .leftJoin(
            meetingRoom,
            and(
              eq(meetingRoom.id, meeting.meetingRoomId),
              eq(meetingRoom.organizationId, meeting.organizationId),
            ),
          )
          .leftJoin(
            meetingRecurrenceSeries,
            and(
              eq(meetingRecurrenceSeries.id, meeting.recurrenceSeriesId),
              eq(
                meetingRecurrenceSeries.organizationId,
                meeting.organizationId,
              ),
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

        const attendees = await transaction
          .select({
            userId: meetingAttendee.userId,
            status: meetingAttendee.status,
          })
          .from(meetingAttendee)
          .where(eq(meetingAttendee.meetingId, meetingId))
          .orderBy(asc(meetingAttendee.userId));

        return MeetingProjectionSourceSchema.parse({
          ...row.meeting,
          room: row.room?.id ? row.room : null,
          recurrence: row.recurrence?.id ? row.recurrence : null,
          attendees,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.database.db
      .select({ id: meeting.id })
      .from(meeting)
      .where(
        and(
          eq(meeting.organizationId, organizationId),
          afterId ? gt(meeting.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(meeting.id))
      .limit(limit);
  }
  async currentManyForGraph(organizationId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.database.db
      .select({
        id: meeting.id,
        title: meeting.title,
        startAt: meeting.startAt,
        canceledAt: meeting.canceledAt,
        updatedAt: meeting.updatedAt,
      })
      .from(meeting)
      .where(
        and(
          eq(meeting.organizationId, organizationId),
          inArray(meeting.id, [...ids].slice(0, 100)),
        ),
      );
    return MeetingGraphSourceSchema.array().parse(rows);
  }
  async listForGraph(
    organizationId: string,
    query: Parameters<MeetingProjectionSourceRepository['listForGraph']>[1],
  ) {
    const pattern = query.q ? toLikeContainsPattern(query.q) : null;
    const rows = await this.database.db
      .select({
        id: meeting.id,
        title: meeting.title,
        startAt: meeting.startAt,
        canceledAt: meeting.canceledAt,
        updatedAt: meeting.updatedAt,
      })
      .from(meeting)
      .where(
        and(
          eq(meeting.organizationId, organizationId),
          pattern ? ilike(meeting.title, pattern) : undefined,
          query.after
            ? or(
                gt(meeting.title, query.after.title),
                and(
                  eq(meeting.title, query.after.title),
                  gt(meeting.id, query.after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(meeting.title), asc(meeting.id))
      .limit(query.limit);
    return MeetingGraphSourceSchema.array().parse(rows);
  }
}
