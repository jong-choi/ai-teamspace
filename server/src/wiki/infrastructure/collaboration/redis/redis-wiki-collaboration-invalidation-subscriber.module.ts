import { Module } from '@nestjs/common';

import { RedisWikiCollaborationInvalidationSubscriber } from '#server/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation.subscriber.js';
import { WikiCollaborationConfigurationModule } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module.js';
import { WikiCollaborationInvalidationSubscriber } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider.js';

@Module({
  imports: [WikiCollaborationConfigurationModule],
  providers: [
    {
      provide: WikiCollaborationInvalidationSubscriber,
      useClass: RedisWikiCollaborationInvalidationSubscriber,
    },
  ],
  exports: [WikiCollaborationInvalidationSubscriber],
})
export class RedisWikiCollaborationInvalidationSubscriberModule {}
