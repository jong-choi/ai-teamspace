import { Injectable } from '@nestjs/common';

import { OrganizationProvider } from '@/organizations/infrastructure/organization/organization.provider';

@Injectable()
export class MembershipProjectionQueryService {
  constructor(private readonly organizations: OrganizationProvider) {}
  existingOrganizationIds(ids: readonly string[]) {
    return this.organizations.listExistingProjectionOrganizationIds(ids);
  }
  organizationExists(id: string) {
    return this.organizations.hasProjectionOrganization(id);
  }
  listOrganizationIds(afterId: string | null, limit: number) {
    return this.organizations.listProjectionOrganizationIds(afterId, limit);
  }

  hasMember(organizationId: string, userId: string) {
    return this.organizations.hasMemberUser(organizationId, userId);
  }

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
