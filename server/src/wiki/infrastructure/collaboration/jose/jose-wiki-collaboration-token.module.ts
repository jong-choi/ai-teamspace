import { Module } from '@nestjs/common';

import { JoseWikiCollaborationTokenAdapter } from '#server/wiki/infrastructure/collaboration/jose/jose-wiki-collaboration-token.adapter.js';
import { WikiCollaborationConfigurationModule } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.module.js';
import { WikiCollaborationTokenProvider } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-token.provider.js';

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
