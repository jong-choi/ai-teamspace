import { Injectable } from '@nestjs/common';

import { AgentConfiguration } from '@/agent/config/agent-configuration';
import {
  AgentModelProvider,
  type AgentModels,
} from '@/agent/infrastructure/model/agent-model.provider';

import { ChatOllama } from '@langchain/ollama';

@Injectable()
export class ConfiguredAgentModelAdapter extends AgentModelProvider {
  constructor(private readonly configuration: AgentConfiguration) {
    super();
  }

  createModels(): AgentModels {
    const configuration = this.configuration.model;
    const createModel = () =>
      new ChatOllama({
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
