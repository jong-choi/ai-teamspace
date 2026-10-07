import type { AgentActor } from '@/agent/domain/agent-actor';
import type { WorkOsToolSession } from '@/agent/infrastructure/mcp/workos-tool-session.provider';

export abstract class ExternalMcpToolSessionProvider {
  abstract open(actor: AgentActor): Promise<WorkOsToolSession>;
}
