import { Injectable } from '@nestjs/common';

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
}
