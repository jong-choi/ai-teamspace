import type { AgentActor } from '@/agent/domain/agent-actor';

import type { StructuredTool } from '@langchain/core/tools';

export type McpToolIdentity =
  | {
      source: 'workos';
      namespace: 'workos';
      originalToolName: string;
    }
  | {
      source: 'external';
      connectionId: string;
      namespace: string;
      originalToolName: string;
      schemaFingerprint: string;
    };

export interface WorkOsToolSession {
  tools: StructuredTool[];
  readOnlyTools: StructuredTool[];
  interruptOn: Record<string, true>;
  toolIdentities: ReadonlyMap<string, McpToolIdentity>;
  close(): Promise<void>;
}

export abstract class WorkOsToolSessionProvider {
  abstract open(actor: AgentActor): Promise<WorkOsToolSession>;
}
