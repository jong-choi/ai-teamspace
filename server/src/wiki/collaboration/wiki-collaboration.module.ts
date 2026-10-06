import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import authConfig from '@/auth/config/auth.config';
import cacheConfig from '@/chat/config/cache.config';
import databaseConfig from '@/database/config/database.config';
import queueConfig from '@/queue/config/queue.config';
import collaborationConfig from '@/wiki/infrastructure/collaboration/config/collaboration.config';
import { HocuspocusWikiCollaborationRuntime } from '@/wiki/infrastructure/collaboration/hocuspocus/hocuspocus-wiki-collaboration.runtime';
import { RedisWikiCollaborationInvalidationSubscriberModule } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation-subscriber.module';
import { WikiModule } from '@/wiki/wiki.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        authConfig,
        cacheConfig,
        collaborationConfig,
        databaseConfig,
        queueConfig,
      ],
      envFilePath: ['.env'],
    }),
    RedisWikiCollaborationInvalidationSubscriberModule,
    WikiModule,
  ],
  providers: [HocuspocusWikiCollaborationRuntime],
  exports: [HocuspocusWikiCollaborationRuntime],
})
export class WikiCollaborationModule {}
