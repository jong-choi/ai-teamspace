import { Module } from '@nestjs/common';

import { FirstPartyTeamspaceMcpModule } from '@/agent/infrastructure/mcp/first-party/first-party-teamspace-mcp.module';
import { TeamspaceToolSessionProvider } from '@/agent/infrastructure/mcp/teamspace-tool-session.provider';
import { CombinedMcpToolSessionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/combined-mcp-tool-session.adapter';
import { ExternalMcpModule } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp.module';

@Module({
  imports: [FirstPartyTeamspaceMcpModule, ExternalMcpModule],
  providers: [
    CombinedMcpToolSessionAdapter,
    {
      provide: TeamspaceToolSessionProvider,
      useExisting: CombinedMcpToolSessionAdapter,
    },
  ],
  exports: [TeamspaceToolSessionProvider],
})
export class CombinedMcpToolSessionModule {}
