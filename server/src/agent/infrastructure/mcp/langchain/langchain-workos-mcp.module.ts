import { Module } from '@nestjs/common';

import { AgentConfigurationModule } from '#server/agent/config/agent-configuration.module.js';
import { LangChainWorkOsMcpAdapter } from '#server/agent/infrastructure/mcp/langchain/langchain-workos-mcp.adapter.js';
import { McpToolApprovalPolicy } from '#server/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy.js';
import { UnavailableMcpCredentialModule } from '#server/agent/infrastructure/mcp/unavailable/unavailable-mcp-credential.module.js';
import { WorkOsToolSessionProvider } from '#server/agent/infrastructure/mcp/workos-tool-session.provider.js';

@Module({
  imports: [AgentConfigurationModule, UnavailableMcpCredentialModule],
  providers: [
    McpToolApprovalPolicy,
    {
      provide: WorkOsToolSessionProvider,
      useClass: LangChainWorkOsMcpAdapter,
    },
  ],
  exports: [WorkOsToolSessionProvider],
})
export class LangChainWorkOsMcpModule {}
