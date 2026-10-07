import {
  getMcpAccessControllerGetCompositeQueryKey,
  useMcpAccessControllerGetCompositeSuspense,
  useOrganizationsControllerGetActiveSuspense,
} from '@repo/client/api-client';
import type { OrganizationAccess } from '@repo/client/api-client/schemas';

export function getMcpAccessQueryKey(organizationId: string) {
  return getMcpAccessControllerGetCompositeQueryKey(organizationId);
}

export function useMcpAccess(organizationId: string) {
  return useMcpAccessControllerGetCompositeSuspense(organizationId);
}

export function useMcpAccessActiveOrganization() {
  return useOrganizationsControllerGetActiveSuspense<OrganizationAccess | null>(
    {
      query: {
        select: (response) => response.activeOrganization,
      },
    },
  );
}
