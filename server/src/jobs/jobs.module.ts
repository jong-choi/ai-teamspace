import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ORGANIZATION_PUBLIC_EVENT_QUEUE } from '#server/organizations/domain/organization-public-event.js';
import { QueueModule } from '#server/queue/queue.module.js';
import { WikiOrganizationAuthorizationProcessor } from '#server/wiki/infrastructure/collaboration/queue/wiki-organization-authorization.processor.js';
import { RedisWikiCollaborationInvalidationPublisherModule } from '#server/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation-publisher.module.js';

@Module({
  imports: [
    QueueModule.forWorker(),
    BullModule.registerQueue({ name: ORGANIZATION_PUBLIC_EVENT_QUEUE }),
    RedisWikiCollaborationInvalidationPublisherModule,
  ],
  providers: [WikiOrganizationAuthorizationProcessor],
})
export class JobsModule {}
