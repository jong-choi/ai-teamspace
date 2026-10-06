import { Module } from '@nestjs/common';

import { AgentConfigurationModule } from '#server/agent/config/agent-configuration.module.js';
import { AgentModelProvider } from '#server/agent/infrastructure/model/agent-model.provider.js';
import { ConfiguredAgentModelAdapter } from '#server/agent/infrastructure/model/configured/configured-agent-model.adapter.js';

@Module({
  imports: [AgentConfigurationModule],
  providers: [
    {
      provide: AgentModelProvider,
      useClass: ConfiguredAgentModelAdapter,
    },
  ],
  exports: [AgentModelProvider],
})
export class ConfiguredAgentModelModule {}
