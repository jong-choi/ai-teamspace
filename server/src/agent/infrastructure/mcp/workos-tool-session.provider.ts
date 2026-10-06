import type { AgentActor } from '#server/agent/domain/agent-actor.js';

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
