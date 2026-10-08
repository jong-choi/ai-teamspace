import { Injectable } from '@nestjs/common';

import { AgentConfiguration } from '@/agent/config/agent-configuration';
import type { AgentActor } from '@/agent/domain/agent-actor';
import { DEFAULT_AGENT_REASONING_EFFORT } from '@/agent/domain/agent-reasoning-effort';
import {
  type AgentModelOptions,
  AgentModelProvider,
  type AgentModels,
} from '@/agent/infrastructure/model/agent-model.provider';
import { ReasoningChatOllama } from '@/agent/infrastructure/model/configured/reasoning-chat-ollama';

@Injectable()
export class ConfiguredAgentModelAdapter extends AgentModelProvider {
  constructor(private readonly configuration: AgentConfiguration) {
    super();
  }

  createModels(_actor?: AgentActor, options?: AgentModelOptions): AgentModels {
    const configuration = this.configuration.model;
    const reasoningEffort =
      options?.reasoningEffort ?? DEFAULT_AGENT_REASONING_EFFORT;
    const createModel = () =>
      new ReasoningChatOllama({
        reasoningEffort,
        model: configuration.name,
        baseUrl: configuration.baseUrl,
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
        },
      });

    return {
      root: createModel(),
      researcher: createModel(),
      operator: createModel(),
    };
  }
}
