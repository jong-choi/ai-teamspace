import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { DatabaseService } from '@/database/database.service';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { RequestQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/request-quota.repository';
import { WikiRefreshAcceptanceRepository } from '@/knowledge-graph/infrastructure/persistence/wiki-refresh-acceptance.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { SemanticRefreshService } from '@/knowledge-graph/semantic-refresh.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';

@Injectable()
export class WikiRefreshAcceptanceDrizzleRepository extends WikiRefreshAcceptanceRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: GraphSourceAccessProvider,
    private readonly publisher: OutboxAggregateChangePublisher,
    private readonly semantic: SemanticRefreshService,
    private readonly quota: RequestQuotaRepository,
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
  ) {
    super();
  }

  accept(organizationId: string, documentId: string, actorUserId: string) {
    return this.database.runInTransaction(async () => {
      const locked = await this.access.lockWikiWriter(
        organizationId,
        actorUserId,
        documentId,
      );
      if (locked === 'forbidden') return { outcome: 'forbidden' as const };
      if (locked === 'not_member' || locked === 'not_found')
        return { outcome: 'not_found' as const };
      await this.publisher.backfillIfMissing(
        this.database.requireTransaction(),
        organizationId,
        'wiki_document',
        documentId,
      );
      const accepted = await this.semantic.requestManualRefreshInTransaction(
        organizationId,
        documentId,
        actorUserId,
      );
      if (accepted.outcome === 'not_found') return accepted;
      if (!accepted.coalesced)
        await this.quota.consume({
          action: 'wiki_refresh',
          organizationId,
          actorUserId,
          policy: {
            windowSeconds: 3600,
            actorLimit: this.config.quota.refreshActorPerHour,
            organizationLimit: this.config.quota.refreshOrganizationPerHour,
          },
        });
      return { ...accepted, sourceUpdatedAt: locked.updatedAt };
    });
  }
}
