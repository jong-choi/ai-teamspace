import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import type { AgentActor } from '@/agent/domain/agent-actor';
import type { WorkOsToolSession } from '@/agent/infrastructure/mcp/workos-tool-session.provider';

export abstract class ExternalMcpConnectionSessionProvider {
  abstract open(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): Promise<WorkOsToolSession>;
}
