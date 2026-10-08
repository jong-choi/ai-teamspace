import { Injectable } from '@nestjs/common';

import { OrganizationProvider } from '@/organizations/infrastructure/organization/organization.provider';

@Injectable()
export class MembershipProjectionQueryService {
  constructor(private readonly organizations: OrganizationProvider) {}

  current(organizationId: string, userId: string) {
    return this.organizations.getMembershipProjection(organizationId, userId);
  }

  listUserIds(
    organizationId: string,
    afterUserId: string | null,
    limit: number,
  ) {
    return this.organizations.listMembershipProjectionUserIds(
      organizationId,
      afterUserId,
      limit,
    );
  }
}
