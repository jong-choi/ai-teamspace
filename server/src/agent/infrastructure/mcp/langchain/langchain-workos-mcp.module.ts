import { Module } from '@nestjs/common';

import { AgentConfigurationModule } from '@/agent/config/agent-configuration.module';
import { LangChainWorkOsMcpAdapter } from '@/agent/infrastructure/mcp/langchain/langchain-workos-mcp.adapter';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import { WorkOsToolSessionProvider } from '@/agent/infrastructure/mcp/workos-tool-session.provider';
import { McpAgentDelegationModule } from '@/mcp-agent-delegations/mcp-agent-delegation.module';

@Module({
  imports: [AgentConfigurationModule, McpAgentDelegationModule],
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
