import { Module } from '@nestjs/common';

import { CombinedMcpToolSessionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/combined-mcp-tool-session.adapter';
import { ExternalMcpModule } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp.module';
import { LangChainWorkOsMcpModule } from '@/agent/infrastructure/mcp/langchain/langchain-workos-mcp.module';
import { WorkOsToolSessionProvider } from '@/agent/infrastructure/mcp/workos-tool-session.provider';

@Module({
  imports: [LangChainWorkOsMcpModule, ExternalMcpModule],
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
