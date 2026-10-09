import { Injectable } from '@nestjs/common';

import { WikiGraphPageQuerySchema } from '@/wiki/domain/wiki-graph-source';
import { WikiProjectionSourceRepository } from '@/wiki/infrastructure/persistence/wiki-projection-source.repository';

@Injectable()
export class WikiProjectionQueryService {
  constructor(private readonly sources: WikiProjectionSourceRepository) {}
  current(organizationId: string, sourceId: string) {
    return this.sources.current(organizationId, sourceId);
  }
  currentSemantic(organizationId: string, sourceId: string) {
    return this.sources.currentSemantic(organizationId, sourceId);
  }
  listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.sources.listIds(organizationId, afterId, limit);
  }
  currentManyForGraph(organizationId: string, ids: readonly string[]) {
    return this.sources.currentManyForGraph(organizationId, ids);
  }
  currentSemanticMany(organizationId: string, ids: readonly string[]) {
    return this.sources.currentSemanticMany(organizationId, ids);
  }
  keywordCandidates(organizationId: string, query: string, limit: number) {
    return this.sources.keywordCandidates(organizationId, query, limit);
  }
  listForGraph(
    organizationId: string,
    query: Parameters<WikiProjectionSourceRepository['listForGraph']>[1],
  ) {
    return this.sources.listForGraph(
      organizationId,
      WikiGraphPageQuerySchema.parse(query),
    );
  }
}
