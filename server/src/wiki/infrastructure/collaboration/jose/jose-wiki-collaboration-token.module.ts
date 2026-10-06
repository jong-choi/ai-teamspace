import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { JoseWikiCollaborationTokenAdapter } from '@/wiki/infrastructure/collaboration/jose/jose-wiki-collaboration-token.adapter';
import { WikiCollaborationTokenProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-token.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: WikiCollaborationTokenProvider,
      useClass: JoseWikiCollaborationTokenAdapter,
    },
  ],
  exports: [WikiCollaborationTokenProvider],
})
export class JoseWikiCollaborationTokenModule {}
