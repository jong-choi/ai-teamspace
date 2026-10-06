import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import {
  ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
  ORGANIZATION_PUBLIC_EVENT_QUEUE,
  type OrganizationAuthorizationChangedEvent,
  OrganizationAuthorizationChangedEventSchema,
} from '#server/organizations/domain/organization-public-event.js';
import { OrganizationPublicEventPublisher } from '#server/organizations/infrastructure/events/organization-public-event.provider.js';

import type { JobsOptions, Queue } from 'bullmq';

const authorizationChangedJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1_000,
  },
  removeOnComplete: true,
  removeOnFail: 100,
} satisfies JobsOptions;

@Injectable()
export class BullMqOrganizationPublicEventPublisher
  extends OrganizationPublicEventPublisher
  implements OnApplicationBootstrap
{
  constructor(
    @InjectQueue(ORGANIZATION_PUBLIC_EVENT_QUEUE)
    private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.waitUntilReady();
  }

  async publishAuthorizationChanged(
    event: OrganizationAuthorizationChangedEvent,
  ): Promise<void> {
    await this.queue.add(
      ORGANIZATION_AUTHORIZATION_CHANGED_JOB,
      OrganizationAuthorizationChangedEventSchema.parse(event),
      authorizationChangedJobOptions,
    );
  }
}
