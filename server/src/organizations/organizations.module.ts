import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { BetterAuthOrganizationModule } from '#server/organizations/infrastructure/organization/better-auth/better-auth-organization.module.js';
import { OrganizationOriginGuard } from '#server/organizations/organization-origin.guard.js';
import { OrganizationsController } from '#server/organizations/organizations.controller.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

@Module({
  imports: [AuthModule, BetterAuthOrganizationModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationOriginGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
