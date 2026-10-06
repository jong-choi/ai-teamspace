import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { BetterAuthWikiCollaborationAuthorizationAdapter } from '@/wiki/infrastructure/collaboration/better-auth/better-auth-wiki-collaboration-authorization.adapter';
import { WikiCollaborationAuthorizationProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-authorization.provider';

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
