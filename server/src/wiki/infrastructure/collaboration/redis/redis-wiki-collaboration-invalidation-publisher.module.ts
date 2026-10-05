import { Module } from '@nestjs/common';

import { RedisWikiCollaborationInvalidationPublisher } from '#server/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation.publisher.js';
import { WikiCollaborationConfigurationModule } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module.js';
import { WikiCollaborationInvalidationPublisher } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider.js';

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
