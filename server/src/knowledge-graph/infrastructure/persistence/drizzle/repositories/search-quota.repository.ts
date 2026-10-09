import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { DatabaseService } from '@/database/database.service';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { RequestQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/request-quota.repository';
import { SearchQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/search-quota.repository';

@Injectable()
export class SearchQuotaDrizzleRepository extends SearchQuotaRepository {
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly database: DatabaseService,
    private readonly quota: RequestQuotaRepository,
  ) {
    super();
  }

  async consume(input: Parameters<SearchQuotaRepository['consume']>[0]) {
    await this.database.runInTransaction(() =>
      this.quota.consume({
        action: 'search_query',
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        policy: {
          windowSeconds: 60,
          actorLimit: this.config.quota.searchActorPerMinute,
          organizationLimit: this.config.quota.searchOrganizationPerMinute,
        },
      }),
    );
  }
}
