import { Module } from '@nestjs/common';

import { WorkOsAgentGraphProvider } from '@/agent/application/workos-agent-graph.provider';
import { DeepAgentBuilder } from '@/agent/infrastructure/deep-agent/deep-agent.builder';
import { DeepAgentWorkOsGraphAdapter } from '@/agent/infrastructure/deep-agent/deep-agent-workos-graph.adapter';
import { ConfiguredAgentModelModule } from '@/agent/infrastructure/model/configured/configured-agent-model.module';
import { CombinedMcpToolSessionModule } from '@/agent-mcp-connections/infrastructure/mcp/combined-mcp-tool-session.module';

@Module({
  imports: [ConfiguredAgentModelModule, CombinedMcpToolSessionModule],
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
