import type { MeetingProjectionSource } from '@/calendar/domain/meeting-projection-source';

export abstract class MeetingProjectionSourceRepository {
  abstract current(
    organizationId: string,
    sourceId: string,
  ): Promise<MeetingProjectionSource | null>;
  abstract listIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<Pick<MeetingProjectionSource, 'id'>[]>;
}
