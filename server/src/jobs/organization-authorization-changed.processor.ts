import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';

import { KnowledgeGraphMembershipBridge } from '@/jobs/knowledge-graph/knowledge-graph-membership-bridge';
import { McpAccessService } from '@/mcp-access/mcp-access.service';
import {
  ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
  ORGANIZATION_PUBLIC_EVENT_QUEUE,
  OrganizationAuthorizationChangedEventSchema,
} from '@/organizations/domain/organization-public-event';
import { WikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';

import type { Job } from 'bullmq';

@Injectable()
@Processor(ORGANIZATION_PUBLIC_EVENT_QUEUE)
export class OrganizationAuthorizationChangedProcessor extends WorkerHost {
  constructor(
    private readonly wikiInvalidationPublisher: WikiCollaborationInvalidationPublisher,
    private readonly mcpAccessService: McpAccessService,
    private readonly knowledgeGraphMembership: KnowledgeGraphMembershipBridge,
  ) {
    super();
  }

  async process(job: Pick<Job, 'name' | 'data'>): Promise<void> {
    if (job.name !== ORGANIZATION_AUTHORIZATION_CHANGED_JOB) {
      throw new Error(
        '지원하지 않는 organization public event입니다: ' + job.name,
      );
    }

    const event = OrganizationAuthorizationChangedEventSchema.parse(job.data);

    await Promise.all([
      this.wikiInvalidationPublisher.publish({
        scope: 'organization-user',
        organizationId: event.organizationId,
        userId: event.userId,
      }),
      this.mcpAccessService.handleOrganizationAuthorizationChanged(event),
      this.knowledgeGraphMembership.record(event),
    ]);
  }
}
