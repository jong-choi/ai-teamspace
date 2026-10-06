import { Module } from '@nestjs/common';

import { RedisWikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation.publisher';
import { WikiCollaborationConfigurationModule } from '@/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module';
import { WikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';

@Module({
  imports: [WikiCollaborationConfigurationModule],
  providers: [
    {
      provide: WikiCollaborationInvalidationPublisher,
      useClass: RedisWikiCollaborationInvalidationPublisher,
    },
  ],
  exports: [WikiCollaborationInvalidationPublisher],
})
export class RedisWikiCollaborationInvalidationPublisherModule {}
