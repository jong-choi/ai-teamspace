import { Injectable } from '@nestjs/common';

import type { OrganizationAccess } from '@/organizations/domain/organization-access';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '@/organizations/infrastructure/organization/organization.provider';

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
