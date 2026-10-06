import { Injectable } from '@nestjs/common';

import type { MeetingRoom } from '@/calendar/domain/meeting-room';
import type { CreateMeetingRoomInput } from '@/calendar/dto/create-meeting-room.dto';
import type { UpdateMeetingRoomInput } from '@/calendar/dto/update-meeting-room.dto';
import {
  toMeetingRoomDomain,
  toMeetingRoomInsert,
  toMeetingRoomUpdate,
} from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-room.mapper';
import { meetingRoom } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema';
import { MeetingRoomRepository } from '@/calendar/infrastructure/persistence/meeting-room.repository';
import { DatabaseService } from '@/database/database.service';

import { and, asc, eq } from 'drizzle-orm';

@Injectable()
export class MeetingRoomDrizzleRepository extends MeetingRoomRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listMeetingRooms(
    organizationId: MeetingRoom['organizationId'],
  ): Promise<MeetingRoom[]> {
    const rows = await this.database.db
      .select()
      .from(meetingRoom)
      .where(eq(meetingRoom.organizationId, organizationId))
      .orderBy(asc(meetingRoom.name), asc(meetingRoom.id));
    return rows.map(toMeetingRoomDomain);
  }

  async findMeetingRoomById(
    organizationId: MeetingRoom['organizationId'],
    meetingRoomId: MeetingRoom['id'],
  ): Promise<MeetingRoom | null> {
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

  async createMeetingRoom(
    organizationId: MeetingRoom['organizationId'],
    input: CreateMeetingRoomInput,
  ): Promise<MeetingRoom> {
    const values: Pick<
      MeetingRoom,
      | 'organizationId'
      | 'name'
      | 'capacity'
      | 'floor'
      | 'description'
      | 'active'
    > = {
      organizationId,
      name: input.name,
      capacity: input.capacity,
      floor: input.floor ?? null,
      description: input.description ?? null,
      active: true,
    };
    const [row] = await this.database.db
      .insert(meetingRoom)
      .values(toMeetingRoomInsert(values))
      .returning();
    if (!row) throw new Error('회의실 생성 결과가 없습니다.');
    return toMeetingRoomDomain(row);
  }

  async updateMeetingRoom(
    organizationId: MeetingRoom['organizationId'],
    meetingRoomId: MeetingRoom['id'],
    input: UpdateMeetingRoomInput,
  ): Promise<MeetingRoom | null> {
    const changes: Partial<
      Pick<
        MeetingRoom,
        'name' | 'capacity' | 'floor' | 'description' | 'active'
      >
    > = input;
    const [row] = await this.database.db
      .update(meetingRoom)
      .set(
        toMeetingRoomUpdate({
          ...changes,
          updatedAt: new Date(),
        }),
      )
      .where(
        and(
          eq(meetingRoom.organizationId, organizationId),
          eq(meetingRoom.id, meetingRoomId),
        ),
      )
      .returning();
    return row ? toMeetingRoomDomain(row) : null;
  }
}
