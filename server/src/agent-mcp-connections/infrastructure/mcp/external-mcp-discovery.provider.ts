import type { AgentActor } from '@/agent/domain/agent-actor';
import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';

export interface ExternalMcpDiscoveredTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface ExternalMcpDiscovery {
  serverName?: string;
  serverVersion?: string;
  tools: ExternalMcpDiscoveredTool[];
}

export abstract class ExternalMcpDiscoveryProvider {
  abstract discover(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): Promise<ExternalMcpDiscovery>;

  abstract discoverWithBearerToken(
    actor: AgentActor,
    connection: AgentMcpConnection,
    bearerToken: string,
  ): Promise<ExternalMcpDiscovery>;
}
