import { Module } from '@nestjs/common';

import { WorkOsAgentGraphProvider } from '#server/agent/application/workos-agent-graph.provider.js';
import { DeepAgentBuilder } from '#server/agent/infrastructure/deep-agent/deep-agent.builder.js';
import { DeepAgentWorkOsGraphAdapter } from '#server/agent/infrastructure/deep-agent/deep-agent-workos-graph.adapter.js';
import { LangChainWorkOsMcpModule } from '#server/agent/infrastructure/mcp/langchain/langchain-workos-mcp.module.js';
import { ConfiguredAgentModelModule } from '#server/agent/infrastructure/model/configured/configured-agent-model.module.js';

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
