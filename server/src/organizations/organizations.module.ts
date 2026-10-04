import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { BetterAuthOrganizationModule } from '#server/organizations/infrastructure/organization/better-auth/better-auth-organization.module.js';
import { OrganizationsController } from '#server/organizations/organizations.controller.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

@Module({
  imports: [AuthModule, BetterAuthOrganizationModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, TrustedOriginGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
