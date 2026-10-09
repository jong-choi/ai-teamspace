import { Injectable } from '@nestjs/common';

import { ProjectGraphPageQuerySchema } from '@/projects/domain/project-graph-source';
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
  currentManyForGraph(organizationId: string, ids: readonly string[]) {
    return this.sources.currentManyForGraph(organizationId, ids);
  }
  listForGraph(
    organizationId: string,
    query: Parameters<TicketProjectionSourceRepository['listForGraph']>[1],
  ) {
    return this.sources.listForGraph(
      organizationId,
      ProjectGraphPageQuerySchema.parse(query),
    );
  }
}
