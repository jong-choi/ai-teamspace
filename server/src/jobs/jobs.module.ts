import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import authConfig from '@/auth/config/auth.config';
import cacheConfig from '@/chat/config/cache.config';
import databaseConfig from '@/database/config/database.config';
import { OrganizationAuthorizationChangedProcessor } from '@/jobs/organization-authorization-changed.processor';
import mcpConfig from '@/mcp/config/mcp.config';
import { McpAccessModule } from '@/mcp-access/mcp-access.module';
import { ORGANIZATION_PUBLIC_EVENT_QUEUE } from '@/organizations/domain/organization-public-event';
import queueConfig from '@/queue/config/queue.config';
import { QueueModule } from '@/queue/queue.module';
import collaborationConfig from '@/wiki/infrastructure/collaboration/config/collaboration.config';
import { RedisWikiCollaborationInvalidationPublisherModule } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation-publisher.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // McpAccessModule이 가져오는 Better Auth, 조직 cache/event, database 의존성의 config도 load한다.
      // 빠지면 worker가 부팅 단계에서 실패하므로 mcp-access-lifecycle integration이 부팅을 검증한다.
      load: [
        authConfig,
        cacheConfig,
        collaborationConfig,
        databaseConfig,
        mcpConfig,
        queueConfig,
      ],
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
