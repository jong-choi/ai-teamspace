import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisWikiCollaborationAttributionAdapter } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-attribution.adapter';
import { WikiCollaborationAttributionProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-attribution.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: WikiCollaborationAttributionProvider,
      useClass: RedisWikiCollaborationAttributionAdapter,
    },
  ],
  exports: [WikiCollaborationAttributionProvider],
})
export class RedisWikiCollaborationAttributionModule {}
