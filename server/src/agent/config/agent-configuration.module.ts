import { Module } from '@nestjs/common';

import { AgentConfiguration } from '#server/agent/config/agent-configuration.js';
import { parseAgentEnvironment } from '#server/agent/config/agent-environment.js';

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
