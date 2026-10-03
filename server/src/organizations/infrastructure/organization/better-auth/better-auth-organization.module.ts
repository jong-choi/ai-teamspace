import { Module } from '@nestjs/common';

import { AuthModule } from '#server/auth/auth.module.js';
import { BetterAuthOrganizationAdapter } from '#server/organizations/infrastructure/organization/better-auth/better-auth-organization.adapter.js';
import { OrganizationProvider } from '#server/organizations/infrastructure/organization/organization.provider.js';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: OrganizationProvider,
      useClass: BetterAuthOrganizationAdapter,
    },
  ],
  exports: [OrganizationProvider],
})
export class BetterAuthOrganizationModule {}
