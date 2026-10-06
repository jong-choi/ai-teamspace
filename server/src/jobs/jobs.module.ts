import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ORGANIZATION_PUBLIC_EVENT_QUEUE } from '@/organizations/domain/organization-public-event';
import { QueueModule } from '@/queue/queue.module';
import queueConfig from '@/queue/config/queue.config';
import collaborationConfig from '@/wiki/infrastructure/collaboration/config/collaboration.config';
import { WikiOrganizationAuthorizationProcessor } from '@/wiki/infrastructure/collaboration/queue/wiki-organization-authorization.processor';
import { RedisWikiCollaborationInvalidationPublisherModule } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation-publisher.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [collaborationConfig, queueConfig],
      envFilePath: ['.env'],
    }),
    QueueModule.forWorker(),
    BullModule.registerQueue({ name: ORGANIZATION_PUBLIC_EVENT_QUEUE }),
    RedisWikiCollaborationInvalidationPublisherModule,
  ],
  providers: [WikiOrganizationAuthorizationProcessor],
})
export class JobsModule {}
