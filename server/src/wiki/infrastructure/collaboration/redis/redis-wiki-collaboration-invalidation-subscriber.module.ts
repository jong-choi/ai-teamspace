import { Module } from '@nestjs/common';

import { RedisWikiCollaborationInvalidationSubscriber } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation.subscriber';
import { WikiCollaborationConfigurationModule } from '@/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module';
import { WikiCollaborationInvalidationSubscriber } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';

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
