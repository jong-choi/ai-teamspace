import type { MeetingRoom } from '@/calendar/domain/meeting-room';
import type { CreateMeetingRoomInput } from '@/calendar/dto/create-meeting-room.dto';
import type { UpdateMeetingRoomInput } from '@/calendar/dto/update-meeting-room.dto';

export abstract class MeetingRoomRepository {
  abstract listMeetingRooms(
    organizationId: MeetingRoom['organizationId'],
  ): Promise<MeetingRoom[]>;

  abstract findMeetingRoomById(
    organizationId: MeetingRoom['organizationId'],
    meetingRoomId: MeetingRoom['id'],
  ): Promise<MeetingRoom | null>;

  abstract createMeetingRoom(
    organizationId: MeetingRoom['organizationId'],
    input: CreateMeetingRoomInput,
  ): Promise<MeetingRoom>;

  abstract updateMeetingRoom(
    organizationId: MeetingRoom['organizationId'],
    meetingRoomId: MeetingRoom['id'],
    input: UpdateMeetingRoomInput,
  ): Promise<MeetingRoom | null>;
}
