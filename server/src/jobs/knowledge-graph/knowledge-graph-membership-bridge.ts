import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { DatabaseService } from '@/database/database.service';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import type { OrganizationAuthorizationChangedEvent } from '@/organizations/domain/organization-public-event';
import { MembershipProjectionQueryService } from '@/organizations/membership-projection-query.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';

@Injectable()
export class KnowledgeGraphMembershipBridge {
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly database: DatabaseService,
    private readonly memberships: MembershipProjectionQueryService,
    private readonly graphEvents: OutboxAggregateChangePublisher,
  ) {}

  async record(event: OrganizationAuthorizationChangedEvent): Promise<void> {
    if (!this.config.enabled) return;
    const current = await this.memberships.current(
      event.organizationId,
      event.userId,
    );
    await this.database.db.transaction((transaction) =>
      this.graphEvents.membershipChanged(
        transaction,
        event.organizationId,
        event.userId,
        current ? 'changed' : 'removed',
      ),
    );
  }
}
