import { Injectable } from '@nestjs/common';

import { toMeetingRoomDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-room.mapper';
import { meetingRoom } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema';
import { MeetingRoomProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-room-projection-source.repository';
import { DatabaseService } from '@/database/database.service';

import { and, asc, eq, gt } from 'drizzle-orm';

@Injectable()
export class MeetingRoomProjectionSourceDrizzleRepository extends MeetingRoomProjectionSourceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }
  async current(organizationId: string, sourceId: string) {
    const [row] = await this.database.db
      .select()
      .from(meetingRoom)
      .where(
        and(
          eq(meetingRoom.organizationId, organizationId),
          eq(meetingRoom.id, sourceId),
        ),
      )
      .limit(1);
    return row ? toMeetingRoomDomain(row) : null;
  }
  async listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.database.db
      .select({ id: meetingRoom.id })
      .from(meetingRoom)
      .where(
        and(
          eq(meetingRoom.organizationId, organizationId),
          afterId ? gt(meetingRoom.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(meetingRoom.id))
      .limit(limit);
  }
}
