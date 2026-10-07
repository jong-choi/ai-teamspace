import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { ChatModule } from '@/chat/chat.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { BullMqOrganizationPublicEventModule } from '@/organizations/infrastructure/events/bullmq/bullmq-organization-public-event.module';
import { BetterAuthOrganizationActiveSessionModule } from '@/organizations/infrastructure/active-organization-session/better-auth/better-auth-organization-active-session.module';
import { BetterAuthOrganizationInvitationModule } from '@/organizations/infrastructure/invitation/better-auth/better-auth-organization-invitation.module';
import { BetterAuthOrganizationModule } from '@/organizations/infrastructure/organization/better-auth/better-auth-organization.module';
import { InvitationsController } from '@/organizations/invitations.controller';
import { OrganizationInvitationsController } from '@/organizations/organization-invitations.controller';
import { OrganizationInvitationsService } from '@/organizations/organization-invitations.service';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import { OrganizationsController } from '@/organizations/organizations.controller';
import { OrganizationsService } from '@/organizations/organizations.service';

@Module({
  imports: [
    AuthModule,
    BullMqOrganizationPublicEventModule,
    BetterAuthOrganizationActiveSessionModule,
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
    OrganizationMembershipService,
    TrustedOriginGuard,
  ],
  exports: [
    OrganizationsService,
    OrganizationInvitationsService,
    OrganizationMembershipService,
  ],
})
export class OrganizationsModule {}
