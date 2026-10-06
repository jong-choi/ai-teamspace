import { Module } from '@nestjs/common';

import { HocuspocusWikiCollaborationRuntime } from '@/wiki/infrastructure/collaboration/hocuspocus/hocuspocus-wiki-collaboration.runtime';
import { RedisWikiCollaborationInvalidationSubscriberModule } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation-subscriber.module';
import { WikiCollaborationConfigurationModule } from '@/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module';
import { WikiModule } from '@/wiki/wiki.module';

@Module({
  imports: [
    RedisWikiCollaborationInvalidationSubscriberModule,
    WikiCollaborationConfigurationModule,
    WikiModule,
  ],
  providers: [HocuspocusWikiCollaborationRuntime],
  exports: [HocuspocusWikiCollaborationRuntime],
})
export class WikiCollaborationModule {}
