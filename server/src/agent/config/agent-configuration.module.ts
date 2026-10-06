import { Module } from '@nestjs/common';

import { AgentConfiguration } from '@/agent/config/agent-configuration';
import { parseAgentEnvironment } from '@/agent/config/agent-environment';

@Module({
  providers: [
    {
      provide: AgentConfiguration,
      useFactory: () => new AgentConfiguration(parseAgentEnvironment()),
    },
  ],
  exports: [AgentConfiguration],
})
export class AgentConfigurationModule {}
