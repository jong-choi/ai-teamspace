import { Module } from '@nestjs/common';

import { JoseWikiCollaborationTokenAdapter } from '@/wiki/infrastructure/collaboration/jose/jose-wiki-collaboration-token.adapter';
import { WikiCollaborationConfigurationModule } from '@/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module';
import { WikiCollaborationTokenProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-token.provider';

@Module({
  imports: [WikiCollaborationConfigurationModule],
  providers: [
    {
      provide: WikiCollaborationTokenProvider,
      useClass: JoseWikiCollaborationTokenAdapter,
    },
  ],
  exports: [WikiCollaborationTokenProvider],
})
export class JoseWikiCollaborationTokenModule {}
