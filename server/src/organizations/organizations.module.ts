import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { ChatModule } from '#server/chat/chat.module.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { BetterAuthOrganizationInvitationModule } from '#server/organizations/infrastructure/invitation/better-auth/better-auth-organization-invitation.module.js';
import { BetterAuthOrganizationModule } from '#server/organizations/infrastructure/organization/better-auth/better-auth-organization.module.js';
import { OrganizationInvitationsController } from '#server/organizations/organization-invitations.controller.js';
import { OrganizationsController } from '#server/organizations/organizations.controller.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

@Module({
  imports: [
    AuthModule,
    BetterAuthOrganizationModule,
    BetterAuthOrganizationInvitationModule,
    ChatModule,
  ],
  controllers: [OrganizationsController, OrganizationInvitationsController],
  providers: [OrganizationsService, TrustedOriginGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
