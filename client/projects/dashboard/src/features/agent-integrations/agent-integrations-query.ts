import {
  useAgentMcpConnectionsControllerDiscoverToolsSuspense,
  useAgentMcpConnectionsControllerListSuspense,
} from '@repo/client/api-client';
import type {
  AgentMcpConnectionList,
  AgentMcpToolCatalog,
} from '@repo/client/api-client/schemas';

export function useAgentMcpConnections() {
  return useAgentMcpConnectionsControllerListSuspense<AgentMcpConnectionList>();
}

export function useAgentMcpTools(connectionId: string) {
  return useAgentMcpConnectionsControllerDiscoverToolsSuspense<AgentMcpToolCatalog>(
    connectionId,
  );
}
