import type { AgentActor } from '@/agent/domain/agent-actor';
import type { TeamspaceToolSession } from '@/agent/infrastructure/mcp/teamspace-tool-session.provider';
import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';

export abstract class ExternalMcpConnectionSessionProvider {
  abstract open(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): Promise<TeamspaceToolSession>;
}
