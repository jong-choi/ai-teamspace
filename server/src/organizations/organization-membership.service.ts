import { Injectable } from '@nestjs/common';

import type { OrganizationAccess } from '#server/organizations/domain/organization-access.js';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '#server/organizations/infrastructure/organization/organization.provider.js';

@Injectable()
export class OrganizationMembershipService {
  constructor(private readonly organizationProvider: OrganizationProvider) {}

  requireAccess(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<OrganizationAccess> {
    return this.organizationProvider.getAccess(context, organizationId);
  }

  hasMemberUser(organizationId: string, userId: string): Promise<boolean> {
    return this.organizationProvider.hasMemberUser(organizationId, userId);
  }
}
