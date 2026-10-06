import { Injectable } from '@nestjs/common';

import type { AgentGraph } from '@repo/agent-runtime';
import { WorkOsAgentGraphProvider } from '#server/agent/application/workos-agent-graph.provider.js';
import { DeepAgentBuilder } from '#server/agent/infrastructure/deep-agent/deep-agent.builder.js';
import {
  DeepAgentLifecycle,
  noOpDeepAgentLifecycle,
} from '#server/agent/infrastructure/deep-agent/deep-agent-lifecycle.js';
import { DeepAgentProtocolAdapter } from '#server/agent/infrastructure/deep-agent/deep-agent-protocol.adapter.js';
import { WorkOsToolSessionProvider } from '#server/agent/infrastructure/mcp/workos-tool-session.provider.js';
import { AgentModelProvider } from '#server/agent/infrastructure/model/agent-model.provider.js';
import { resolveAgentActor } from '#server/agent/infrastructure/runtime/agent-actor.mapper.js';

@Injectable()
export class DeepAgentWorkOsGraphAdapter extends WorkOsAgentGraphProvider {
  private stateGraphPromise: Promise<AgentGraph> | undefined;

  constructor(
    private readonly models: AgentModelProvider,
    private readonly sessions: WorkOsToolSessionProvider,
    private readonly builder: DeepAgentBuilder,
  ) {
    super();
  }

  async createExecution(
    configurable: Record<string, unknown> | undefined,
  ): Promise<AgentGraph> {
    const actor = resolveAgentActor(configurable);
    const session = await this.sessions.open(actor);
    const lifecycle = new DeepAgentLifecycle(() => session.close());

    try {
      const models = await this.models.createModels(actor);
      const agent = this.builder.buildExecution({ models, session });
      return new DeepAgentProtocolAdapter(agent, lifecycle);
    } catch (error) {
      await lifecycle.close();
      throw error;
    }
  }

  resolveState(): Promise<AgentGraph> {
    this.stateGraphPromise ??= this.createStateGraph().catch(
      (error: unknown) => {
        this.stateGraphPromise = undefined;
        throw error;
      },
    );
    return this.stateGraphPromise;
  }

  private async createStateGraph(): Promise<AgentGraph> {
    const models = await this.models.createModels();
    const agent = this.builder.buildState(models);
    return new DeepAgentProtocolAdapter(agent, noOpDeepAgentLifecycle());
  }
}
