import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { ChatModule } from '#server/chat/chat.module.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { BullMqOrganizationPublicEventModule } from '#server/organizations/infrastructure/events/bullmq/bullmq-organization-public-event.module.js';
import { BetterAuthOrganizationInvitationModule } from '#server/organizations/infrastructure/invitation/better-auth/better-auth-organization-invitation.module.js';
import { BetterAuthOrganizationModule } from '#server/organizations/infrastructure/organization/better-auth/better-auth-organization.module.js';
import { InvitationsController } from '#server/organizations/invitations.controller.js';
import { OrganizationInvitationsController } from '#server/organizations/organization-invitations.controller.js';
import { OrganizationInvitationsService } from '#server/organizations/organization-invitations.service.js';
import { OrganizationsController } from '#server/organizations/organizations.controller.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

@Module({
  imports: [
    AuthModule,
    BullMqOrganizationPublicEventModule,
    BetterAuthOrganizationModule,
    BetterAuthOrganizationInvitationModule,
    ChatModule,
  ],
  controllers: [
    OrganizationsController,
    OrganizationInvitationsController,
    InvitationsController,
  ],
  providers: [
    OrganizationsService,
    OrganizationInvitationsService,
    TrustedOriginGuard,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
