import type { AgentActor } from '@/agent/domain/agent-actor';

import type { StructuredTool } from '@langchain/core/tools';

export interface WorkOsToolSession {
  tools: StructuredTool[];
  readOnlyTools: StructuredTool[];
  interruptOn: Record<string, true>;
  close(): Promise<void>;
}

export abstract class WorkOsToolSessionProvider {
  abstract open(actor: AgentActor): Promise<WorkOsToolSession>;
}
