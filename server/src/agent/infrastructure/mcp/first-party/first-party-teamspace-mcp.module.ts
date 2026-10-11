import { Module } from '@nestjs/common';

import { AgentConfigurationModule } from '@/agent/config/agent-configuration.module';
import { FirstPartyTeamspaceMcpAdapter } from '@/agent/infrastructure/mcp/first-party/first-party-teamspace-mcp.adapter';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import { McpFirstPartyModule } from '@/mcp/mcp-first-party.module';

@Module({
  imports: [AgentConfigurationModule, McpFirstPartyModule],
  providers: [McpToolApprovalPolicy, FirstPartyTeamspaceMcpAdapter],
  exports: [FirstPartyTeamspaceMcpAdapter],
})
export class FirstPartyTeamspaceMcpModule {}
