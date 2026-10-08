import { Module } from '@nestjs/common';

import { BetterAuthOrganizationModule } from '@/organizations/infrastructure/organization/better-auth/better-auth-organization.module';
import { MembershipProjectionQueryService } from '@/organizations/membership-projection-query.service';
@Module({
  imports: [BetterAuthOrganizationModule],
  providers: [MembershipProjectionQueryService],
  exports: [MembershipProjectionQueryService],
})
export class MembershipProjectionQueryModule {}
