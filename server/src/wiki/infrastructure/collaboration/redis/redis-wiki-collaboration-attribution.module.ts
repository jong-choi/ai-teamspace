import { Module } from '@nestjs/common';

import { RedisWikiCollaborationAttributionAdapter } from '#server/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-attribution.adapter.js';
import { WikiCollaborationAttributionProvider } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-attribution.provider.js';
import { WikiCollaborationConfigurationModule } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module.js';

@Module({
  imports: [WikiCollaborationConfigurationModule],
  providers: [
    {
      provide: WikiCollaborationAttributionProvider,
      useClass: RedisWikiCollaborationAttributionAdapter,
    },
  ],
  exports: [WikiCollaborationAttributionProvider],
})
export class RedisWikiCollaborationAttributionModule {}
