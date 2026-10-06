import { Module } from '@nestjs/common';

import { AgentRuntimeModule } from '@repo/agent-runtime';
import { AgentRuntimeInfrastructureModule } from '#server/agent/infrastructure/runtime/agent-runtime-infrastructure.module.js';
import { AgentRuntimeOptionsFactory } from '#server/agent/infrastructure/runtime/agent-runtime-options.factory.js';

@Module({
  imports: [
    AgentRuntimeModule.forRootAsync({
      imports: [AgentRuntimeInfrastructureModule],
      inject: [AgentRuntimeOptionsFactory],
      useFactory: (factory: AgentRuntimeOptionsFactory) => factory.create(),
    }),
  ],
})
export class AgentModule {}
