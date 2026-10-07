import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { OrganizationAuthorizationChangedProcessor } from '@/jobs/organization-authorization-changed.processor';
import { McpAccessModule } from '@/mcp-access/mcp-access.module';
import { ORGANIZATION_PUBLIC_EVENT_QUEUE } from '@/organizations/domain/organization-public-event';
import { QueueModule } from '@/queue/queue.module';
import queueConfig from '@/queue/config/queue.config';
import collaborationConfig from '@/wiki/infrastructure/collaboration/config/collaboration.config';
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
    McpAccessModule,
    RedisWikiCollaborationInvalidationPublisherModule,
  ],
  providers: [OrganizationAuthorizationChangedProcessor],
})
export class JobsModule {}
