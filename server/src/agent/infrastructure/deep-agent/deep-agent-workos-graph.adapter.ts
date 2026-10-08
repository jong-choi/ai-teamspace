import { Injectable } from '@nestjs/common';

import type { AgentGraph } from '@repo/agent-runtime';
import { WorkOsAgentGraphProvider } from '@/agent/application/workos-agent-graph.provider';
import { resolveAgentReasoningEffort } from '@/agent/domain/agent-reasoning-effort';
import { DeepAgentBuilder } from '@/agent/infrastructure/deep-agent/deep-agent.builder';
import {
  DeepAgentLifecycle,
  noOpDeepAgentLifecycle,
} from '@/agent/infrastructure/deep-agent/deep-agent-lifecycle';
import { DeepAgentProtocolAdapter } from '@/agent/infrastructure/deep-agent/deep-agent-protocol.adapter';
import { WorkOsToolSessionProvider } from '@/agent/infrastructure/mcp/workos-tool-session.provider';
import { AgentModelProvider } from '@/agent/infrastructure/model/agent-model.provider';
import { resolveAgentActor } from '@/agent/infrastructure/runtime/agent-actor.mapper';

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
    const reasoningEffort = resolveAgentReasoningEffort(configurable);
    const session = await this.sessions.open(actor);
    const lifecycle = new DeepAgentLifecycle(() => session.close());

    try {
      const models = await this.models.createModels(actor, {
        reasoningEffort,
      });
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
