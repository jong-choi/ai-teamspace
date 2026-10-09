import { Injectable } from '@nestjs/common';

import { ProjectGraphPageQuerySchema } from '@/projects/domain/project-graph-source';
import { ProjectProjectionSourceRepository } from '@/projects/infrastructure/persistence/project-projection-source.repository';

@Injectable()
export class ProjectProjectionQueryService {
  constructor(private readonly sources: ProjectProjectionSourceRepository) {}
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
    query: Parameters<ProjectProjectionSourceRepository['listForGraph']>[1],
  ) {
    return this.sources.listForGraph(
      organizationId,
      ProjectGraphPageQuerySchema.parse(query),
    );
  }
}
