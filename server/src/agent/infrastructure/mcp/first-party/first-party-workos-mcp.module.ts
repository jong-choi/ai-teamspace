import { Module } from '@nestjs/common';

import { AgentConfigurationModule } from '@/agent/config/agent-configuration.module';
import { FirstPartyWorkOsMcpAdapter } from '@/agent/infrastructure/mcp/first-party/first-party-workos-mcp.adapter';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import { McpFirstPartyModule } from '@/mcp/mcp-first-party.module';

@Module({
  imports: [AgentConfigurationModule, McpFirstPartyModule],
  providers: [McpToolApprovalPolicy, FirstPartyWorkOsMcpAdapter],
  exports: [FirstPartyWorkOsMcpAdapter],
})
export class FirstPartyWorkOsMcpModule {}
