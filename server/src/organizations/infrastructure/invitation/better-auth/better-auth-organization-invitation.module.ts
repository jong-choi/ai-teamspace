import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { BetterAuthOrganizationInvitationAdapter } from '@/organizations/infrastructure/invitation/better-auth/better-auth-organization-invitation.adapter';
import { OrganizationInvitationProvider } from '@/organizations/infrastructure/invitation/organization-invitation.provider';

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
