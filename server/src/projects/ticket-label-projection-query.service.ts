import { Injectable } from '@nestjs/common';

import { TicketLabelProjectionSourceRepository } from '@/projects/infrastructure/persistence/ticket-label-projection-source.repository';

@Injectable()
export class TicketLabelProjectionQueryService {
  constructor(
    private readonly sources: TicketLabelProjectionSourceRepository,
  ) {}
  current(organizationId: string, sourceId: string) {
    return this.sources.current(organizationId, sourceId);
  }
  listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.sources.listIds(organizationId, afterId, limit);
  }
}
