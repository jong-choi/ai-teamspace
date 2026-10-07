import {
  useAgentMcpConnectionsControllerDiscoverToolsSuspense,
  useAgentMcpConnectionsControllerListSuspense,
  useOrganizationsControllerGetActiveSuspense,
} from '@repo/client/api-client';
import type {
  AgentMcpConnectionList,
  AgentMcpToolCatalog,
  OrganizationAccess,
} from '@repo/client/api-client/schemas';

export function useAgentIntegrationsActiveOrganization() {
  return useOrganizationsControllerGetActiveSuspense<OrganizationAccess | null>(
    {
      query: {
        select: (response) => response.activeOrganization,
      },
    },
  );
}

export function useAgentMcpConnections() {
  return useAgentMcpConnectionsControllerListSuspense<AgentMcpConnectionList>();
}

export function useAgentMcpTools(connectionId: string) {
  return useAgentMcpConnectionsControllerDiscoverToolsSuspense<AgentMcpToolCatalog>(
    connectionId,
  );
}
