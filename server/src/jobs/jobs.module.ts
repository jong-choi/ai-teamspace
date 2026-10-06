import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ORGANIZATION_PUBLIC_EVENT_QUEUE } from '@/organizations/domain/organization-public-event';
import { QueueModule } from '@/queue/queue.module';
import { WikiOrganizationAuthorizationProcessor } from '@/wiki/infrastructure/collaboration/queue/wiki-organization-authorization.processor';
import { RedisWikiCollaborationInvalidationPublisherModule } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation-publisher.module';

@Module({
  imports: [
    QueueModule.forWorker(),
    BullModule.registerQueue({ name: ORGANIZATION_PUBLIC_EVENT_QUEUE }),
    RedisWikiCollaborationInvalidationPublisherModule,
  ],
  providers: [WikiOrganizationAuthorizationProcessor],
})
export class JobsModule {}
