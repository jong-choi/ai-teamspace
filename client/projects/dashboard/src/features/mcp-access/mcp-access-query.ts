import { useOrganizationsControllerGetActiveSuspense } from '@repo/client/api-client';
import type { OrganizationAccess } from '@repo/client/api-client/schemas';
import { getMcpAccessTransport } from '@core/features/mcp-access/mcp-access-client';

import { useSuspenseQuery } from '@tanstack/react-query';

export function getMcpAccessQueryKey(organizationId: string) {
  return ['mcp-access', organizationId] as const;
}

export function useMcpAccess(organizationId: string) {
  return useSuspenseQuery({
    queryKey: getMcpAccessQueryKey(organizationId),
    queryFn: () => getMcpAccessTransport().getComposite(organizationId),
  });
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
