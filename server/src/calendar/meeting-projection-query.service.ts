import { Injectable } from '@nestjs/common';

import { MeetingGraphPageQuerySchema } from '@/calendar/domain/meeting-graph-source';
import { MeetingProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-projection-source.repository';
import { MeetingRecurrenceProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-recurrence-projection-source.repository';
import { MeetingRoomProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-room-projection-source.repository';

@Injectable()
export class MeetingProjectionQueryService {
  constructor(
    private readonly sources: MeetingProjectionSourceRepository,
    private readonly rooms: MeetingRoomProjectionSourceRepository,
    private readonly recurrences: MeetingRecurrenceProjectionSourceRepository,
  ) {}
  room(organizationId: string, sourceId: string) {
    return this.rooms.current(organizationId, sourceId);
  }
  recurrence(organizationId: string, sourceId: string) {
    return this.recurrences.current(organizationId, sourceId);
  }
  listRoomIds(organizationId: string, afterId: string | null, limit: number) {
    return this.rooms.listIds(organizationId, afterId, limit);
  }
  listRecurrenceIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ) {
    return this.recurrences.listIds(organizationId, afterId, limit);
  }
  current(organizationId: string, sourceId: string) {
    return this.sources.current(organizationId, sourceId);
  }
  listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.sources.listIds(organizationId, afterId, limit);
  }
  currentManyForGraph(organizationId: string, ids: readonly string[]) {
    return this.sources.currentManyForGraph(organizationId, ids);
  }
  listForGraph(
    organizationId: string,
    query: Parameters<MeetingProjectionSourceRepository['listForGraph']>[1],
  ) {
    return this.sources.listForGraph(
      organizationId,
      MeetingGraphPageQuerySchema.parse(query),
    );
  }
}
