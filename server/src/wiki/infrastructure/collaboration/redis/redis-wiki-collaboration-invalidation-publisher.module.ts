import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisWikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation.publisher';
import { WikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: WikiCollaborationInvalidationPublisher,
      useClass: RedisWikiCollaborationInvalidationPublisher,
    },
  ],
  exports: [WikiCollaborationInvalidationPublisher],
})
export class RedisWikiCollaborationInvalidationPublisherModule {}
