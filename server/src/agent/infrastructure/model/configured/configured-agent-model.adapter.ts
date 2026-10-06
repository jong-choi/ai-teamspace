import { Injectable } from '@nestjs/common';

import { AgentConfiguration } from '#server/agent/config/agent-configuration.js';
import {
  AgentModelProvider,
  type AgentModels,
} from '#server/agent/infrastructure/model/agent-model.provider.js';

@Injectable()
export class ConfiguredAgentModelAdapter extends AgentModelProvider {
  constructor(private readonly configuration: AgentConfiguration) {
    super();
  }

  createModels(): AgentModels {
    const model = this.configuration.modelSpec;
    return {
      root: model,
      researcher: model,
      operator: model,
    };
  }
}
