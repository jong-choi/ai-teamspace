import { Module } from '@nestjs/common';

import { RedisWikiCollaborationAttributionAdapter } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-attribution.adapter';
import { WikiCollaborationAttributionProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-attribution.provider';
import { WikiCollaborationConfigurationModule } from '@/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module';

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
