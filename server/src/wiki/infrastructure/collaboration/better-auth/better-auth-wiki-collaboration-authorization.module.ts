import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { BetterAuthWikiCollaborationAuthorizationAdapter } from '#server/wiki/infrastructure/collaboration/better-auth/better-auth-wiki-collaboration-authorization.adapter.js';
import { WikiCollaborationAuthorizationProvider } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-authorization.provider.js';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: WikiCollaborationAuthorizationProvider,
      useClass: BetterAuthWikiCollaborationAuthorizationAdapter,
    },
  ],
  exports: [WikiCollaborationAuthorizationProvider],
})
export class BetterAuthWikiCollaborationAuthorizationModule {}
