import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisWikiCollaborationInvalidationSubscriber } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation.subscriber';
import { WikiCollaborationInvalidationSubscriber } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: WikiCollaborationInvalidationSubscriber,
      useClass: RedisWikiCollaborationInvalidationSubscriber,
    },
  ],
  exports: [WikiCollaborationInvalidationSubscriber],
})
export class RedisWikiCollaborationInvalidationSubscriberModule {}
