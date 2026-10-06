import { Module } from '@nestjs/common';

import { WorkOsAgentGraphProvider } from '@/agent/application/workos-agent-graph.provider';
import { DeepAgentBuilder } from '@/agent/infrastructure/deep-agent/deep-agent.builder';
import { DeepAgentWorkOsGraphAdapter } from '@/agent/infrastructure/deep-agent/deep-agent-workos-graph.adapter';
import { LangChainWorkOsMcpModule } from '@/agent/infrastructure/mcp/langchain/langchain-workos-mcp.module';
import { ConfiguredAgentModelModule } from '@/agent/infrastructure/model/configured/configured-agent-model.module';

@Module({
  imports: [ConfiguredAgentModelModule, LangChainWorkOsMcpModule],
  providers: [
    DeepAgentBuilder,
    {
      provide: WorkOsAgentGraphProvider,
      useClass: DeepAgentWorkOsGraphAdapter,
    },
  ],
  exports: [WorkOsAgentGraphProvider],
})
export class DeepAgentModule {}
