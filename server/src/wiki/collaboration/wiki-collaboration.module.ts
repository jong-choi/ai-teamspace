import { Module } from '@nestjs/common';

import { HocuspocusWikiCollaborationRuntime } from '#server/wiki/infrastructure/collaboration/hocuspocus/hocuspocus-wiki-collaboration.runtime.js';
import { RedisWikiCollaborationInvalidationSubscriberModule } from '#server/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation-subscriber.module.js';
import { WikiCollaborationConfigurationModule } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module.js';
import { WikiModule } from '#server/wiki/wiki.module.js';

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
