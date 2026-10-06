import { Module } from '@nestjs/common';

import { AgentConfigurationModule } from '@/agent/config/agent-configuration.module';
import { AgentModelProvider } from '@/agent/infrastructure/model/agent-model.provider';
import { ConfiguredAgentModelAdapter } from '@/agent/infrastructure/model/configured/configured-agent-model.adapter';

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
