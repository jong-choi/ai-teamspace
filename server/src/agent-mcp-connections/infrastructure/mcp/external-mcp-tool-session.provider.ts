import type { AgentActor } from '@/agent/domain/agent-actor';
import type { TeamspaceToolSession } from '@/agent/infrastructure/mcp/teamspace-tool-session.provider';

export abstract class ExternalMcpToolSessionProvider {
  abstract open(actor: AgentActor): Promise<TeamspaceToolSession>;
}
