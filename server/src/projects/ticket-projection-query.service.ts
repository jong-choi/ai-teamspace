import { Injectable } from '@nestjs/common';

import { TicketProjectionSourceRepository } from '@/projects/infrastructure/persistence/ticket-projection-source.repository';

@Injectable()
export class TicketProjectionQueryService {
  constructor(private readonly sources: TicketProjectionSourceRepository) {}
  current(organizationId: string, sourceId: string) {
    return this.sources.current(organizationId, sourceId);
  }
  listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.sources.listIds(organizationId, afterId, limit);
  }
}
