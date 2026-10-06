import { Injectable } from '@nestjs/common';

import { AgentConfiguration } from '@/agent/config/agent-configuration';
import {
  AgentModelProvider,
  type AgentModels,
} from '@/agent/infrastructure/model/agent-model.provider';

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
