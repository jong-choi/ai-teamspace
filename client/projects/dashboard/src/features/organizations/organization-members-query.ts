import {
  useOrganizationsControllerGetDetailSuspense,
  useOrganizationsControllerListMembersSuspense,
} from '@repo/client/api-client';
import type { OrganizationsControllerListMembersParams } from '@repo/client/api-client/schemas';

export function useOrganizationAccess(organizationId: string) {
  return useOrganizationsControllerGetDetailSuspense(organizationId);
}

export function useOrganizationMemberPage(
  organizationId: string,
  params: OrganizationsControllerListMembersParams,
) {
  return useOrganizationsControllerListMembersSuspense(organizationId, params);
}
