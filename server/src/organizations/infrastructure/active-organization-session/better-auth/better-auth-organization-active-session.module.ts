import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { OrganizationActiveSessionProvider } from '@/organizations/infrastructure/active-organization-session/organization-active-session.provider';
import { BetterAuthOrganizationActiveSessionAdapter } from '@/organizations/infrastructure/active-organization-session/better-auth/better-auth-organization-active-session.adapter';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: OrganizationActiveSessionProvider,
      useClass: BetterAuthOrganizationActiveSessionAdapter,
    },
  ],
  exports: [OrganizationActiveSessionProvider],
})
export class BetterAuthOrganizationActiveSessionModule {}
