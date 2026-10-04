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

export function useOrganizationMemberTotal(organizationId: string) {
  return useOrganizationsControllerListMembersSuspense<number>(
    organizationId,
    { limit: 1, offset: 0 },
    {
      query: {
        select: (response) => response.total,
      },
    },
  );
}
