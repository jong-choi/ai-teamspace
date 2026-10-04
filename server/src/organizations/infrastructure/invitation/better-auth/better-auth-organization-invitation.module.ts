import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { BetterAuthOrganizationInvitationAdapter } from '#server/organizations/infrastructure/invitation/better-auth/better-auth-organization-invitation.adapter.js';
import { OrganizationInvitationProvider } from '#server/organizations/infrastructure/invitation/organization-invitation.provider.js';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: OrganizationInvitationProvider,
      useClass: BetterAuthOrganizationInvitationAdapter,
    },
  ],
  exports: [OrganizationInvitationProvider],
})
export class BetterAuthOrganizationInvitationModule {}
