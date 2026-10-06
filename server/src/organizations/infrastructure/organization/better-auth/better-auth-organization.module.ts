import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { BetterAuthOrganizationAdapter } from '@/organizations/infrastructure/organization/better-auth/better-auth-organization.adapter';
import { OrganizationProvider } from '@/organizations/infrastructure/organization/organization.provider';

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
