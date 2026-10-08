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
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';

import { and, asc, eq } from 'drizzle-orm';

@Injectable()
export class MeetingRoomDrizzleRepository extends MeetingRoomRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly graphEvents: OutboxAggregateChangePublisher,
  ) {
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
    return this.database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(meetingRoom)
        .values(toMeetingRoomInsert(values))
        .returning();
      if (!row) throw new Error('회의실 생성 결과가 없습니다.');
      await this.graphEvents.meetingRoomChanged(
        transaction,
        organizationId,
        row.id,
        'changed',
      );
      return toMeetingRoomDomain(row);
    });
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
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(meetingRoom)
        .where(
          and(
            eq(meetingRoom.organizationId, organizationId),
            eq(meetingRoom.id, meetingRoomId),
          ),
        )
        .for('update')
        .limit(1);
      if (!current) return null;
      const changed =
        (input.name !== undefined && input.name !== current.name) ||
        (input.capacity !== undefined && input.capacity !== current.capacity) ||
        (input.floor !== undefined && input.floor !== current.floor) ||
        (input.description !== undefined &&
          input.description !== current.description) ||
        (input.active !== undefined && input.active !== current.active);
      if (!changed) return toMeetingRoomDomain(current);
      const [row] = await transaction
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
      if (!row) throw new Error('회의실 변경 결과가 없습니다.');
      await this.graphEvents.meetingRoomChanged(
        transaction,
        organizationId,
        row.id,
        'changed',
      );
      return toMeetingRoomDomain(row);
    });
  }
}
