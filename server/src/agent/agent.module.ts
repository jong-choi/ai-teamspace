import { Module } from '@nestjs/common';

import { AgentRuntimeModule } from '@repo/agent-runtime';
import { AgentRuntimeInfrastructureModule } from '@/agent/infrastructure/runtime/agent-runtime-infrastructure.module';
import { AgentRuntimeOptionsFactory } from '@/agent/infrastructure/runtime/agent-runtime-options.factory';

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
