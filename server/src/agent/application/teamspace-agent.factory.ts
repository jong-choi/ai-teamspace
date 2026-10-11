import { Injectable } from '@nestjs/common';

import type { AgentGraphFactory } from '@repo/agent-runtime';
import { TeamspaceAgentGraphProvider } from '@/agent/application/teamspace-agent-graph.provider';

@Injectable()
export class TeamspaceAgentFactory {
  constructor(private readonly graphs: TeamspaceAgentGraphProvider) {}

  createGraphFactory(): AgentGraphFactory {
    const factory: AgentGraphFactory = ({ configurable }) =>
      this.graphs.createExecution(configurable);
    factory.resolveState = () => this.graphs.resolveState();
    return factory;
  }
}
