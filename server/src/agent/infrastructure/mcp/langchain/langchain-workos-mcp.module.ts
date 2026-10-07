import { Module } from '@nestjs/common';

import { AgentConfigurationModule } from '@/agent/config/agent-configuration.module';
import { LangChainWorkOsMcpAdapter } from '@/agent/infrastructure/mcp/langchain/langchain-workos-mcp.adapter';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import { UnavailableMcpCredentialModule } from '@/agent/infrastructure/mcp/unavailable/unavailable-mcp-credential.module';
import { WorkOsToolSessionProvider } from '@/agent/infrastructure/mcp/workos-tool-session.provider';

@Module({
  imports: [AgentConfigurationModule, UnavailableMcpCredentialModule],
  providers: [
    McpToolApprovalPolicy,
    LangChainWorkOsMcpAdapter,
    {
      provide: WorkOsToolSessionProvider,
      useExisting: LangChainWorkOsMcpAdapter,
    },
  ],
  exports: [LangChainWorkOsMcpAdapter, WorkOsToolSessionProvider],
})
export class LangChainWorkOsMcpModule {}
