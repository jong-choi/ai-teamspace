import { Injectable } from '@nestjs/common';

import type { AgentGraphFactory } from '@repo/agent-runtime';
import { WorkOsAgentGraphProvider } from '#server/agent/application/workos-agent-graph.provider.js';

@Injectable()
export class WorkOsAgentFactory {
  constructor(private readonly graphs: WorkOsAgentGraphProvider) {}

  createGraphFactory(): AgentGraphFactory {
    const factory: AgentGraphFactory = ({ configurable }) =>
      this.graphs.createExecution(configurable);
    factory.resolveState = () => this.graphs.resolveState();
    return factory;
  }
}
