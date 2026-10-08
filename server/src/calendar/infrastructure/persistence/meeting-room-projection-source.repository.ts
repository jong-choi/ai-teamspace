import type { MeetingRoom } from '@/calendar/domain/meeting-room';

export abstract class MeetingRoomProjectionSourceRepository {
  abstract current(
    organizationId: string,
    sourceId: string,
  ): Promise<MeetingRoom | null>;
  abstract listIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<Pick<MeetingRoom, 'id'>[]>;
}
