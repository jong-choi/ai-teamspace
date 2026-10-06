import type { AgentGraph } from '@repo/agent-runtime';

export abstract class WorkOsAgentGraphProvider {
  abstract createExecution(
    configurable: Record<string, unknown> | undefined,
  ): Promise<AgentGraph>;

  abstract resolveState(): Promise<AgentGraph>;
}
