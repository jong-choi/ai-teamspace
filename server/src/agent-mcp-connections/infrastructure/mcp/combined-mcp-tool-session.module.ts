import { Module } from '@nestjs/common';

import { FirstPartyWorkOsMcpModule } from '@/agent/infrastructure/mcp/first-party/first-party-workos-mcp.module';
import { WorkOsToolSessionProvider } from '@/agent/infrastructure/mcp/workos-tool-session.provider';
import { CombinedMcpToolSessionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/combined-mcp-tool-session.adapter';
import { ExternalMcpModule } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp.module';

@Module({
  imports: [FirstPartyWorkOsMcpModule, ExternalMcpModule],
  providers: [
    CombinedMcpToolSessionAdapter,
    {
      provide: WorkOsToolSessionProvider,
      useExisting: CombinedMcpToolSessionAdapter,
    },
  ],
  exports: [WorkOsToolSessionProvider],
})
export class CombinedMcpToolSessionModule {}
