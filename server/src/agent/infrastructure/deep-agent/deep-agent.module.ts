import { Module } from '@nestjs/common';

import { TeamspaceAgentGraphProvider } from '@/agent/application/teamspace-agent-graph.provider';
import { DeepAgentBuilder } from '@/agent/infrastructure/deep-agent/deep-agent.builder';
import { DeepAgentTeamspaceGraphAdapter } from '@/agent/infrastructure/deep-agent/deep-agent-teamspace-graph.adapter';
import { ConfiguredAgentModelModule } from '@/agent/infrastructure/model/configured/configured-agent-model.module';
import { CombinedMcpToolSessionModule } from '@/agent-mcp-connections/infrastructure/mcp/combined-mcp-tool-session.module';
import { OrganizationsModule } from '@/organizations/organizations.module';

@Module({
  imports: [
    ConfiguredAgentModelModule,
    CombinedMcpToolSessionModule,
    OrganizationsModule,
  ],
  providers: [
    DeepAgentBuilder,
    {
      provide: TeamspaceAgentGraphProvider,
      useClass: DeepAgentTeamspaceGraphAdapter,
    },
  ],
  exports: [TeamspaceAgentGraphProvider],
})
export class DeepAgentModule {}
