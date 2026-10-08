import { Injectable } from '@nestjs/common';

import { MeetingProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-projection-source.repository';

@Injectable()
export class MeetingProjectionQueryService {
  constructor(private readonly sources: MeetingProjectionSourceRepository) {}
  current(organizationId: string, sourceId: string) {
    return this.sources.current(organizationId, sourceId);
  }
  listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.sources.listIds(organizationId, afterId, limit);
  }
}
