import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';

import {
  ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
  ORGANIZATION_PUBLIC_EVENT_QUEUE,
  OrganizationAuthorizationChangedEventSchema,
} from '#server/organizations/domain/organization-public-event.js';
import {
  type WikiCollaborationInvalidationEvent,
  WikiCollaborationInvalidationPublisher,
} from '#server/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider.js';

import type { Job } from 'bullmq';

@Injectable()
@Processor(ORGANIZATION_PUBLIC_EVENT_QUEUE)
export class WikiOrganizationAuthorizationProcessor extends WorkerHost {
  constructor(
    private readonly invalidationPublisher: WikiCollaborationInvalidationPublisher,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.invalidationPublisher.publish(
      toWikiCollaborationInvalidationEvent(job.name, job.data),
    );
  }
}

export function toWikiCollaborationInvalidationEvent(
  jobName: string,
  data: unknown,
): WikiCollaborationInvalidationEvent {
  if (jobName !== ORGANIZATION_AUTHORIZATION_CHANGED_JOB) {
    throw new Error(
      `지원하지 않는 organization public event입니다: ${jobName}`,
    );
  }
  const event = OrganizationAuthorizationChangedEventSchema.parse(data);
  return {
    scope: 'organization-user',
    organizationId: event.organizationId,
    userId: event.userId,
  };
}
