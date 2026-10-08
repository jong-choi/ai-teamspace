import { Module } from '@nestjs/common';

import { McpFirstPartyConnectionService } from '@/mcp/mcp-first-party-connection.service';
import { WorkOsMcpServerFactory } from '@/mcp/mcp-server.factory';
import { McpToolsModule } from '@/mcp/tools/mcp-tools.module';
import { McpAccessModule } from '@/mcp-access/mcp-access.module';

/** Work OS MCP 서버 구성과 built-in Agent용 내부 연결을 제공한다. */
@Module({
  imports: [McpAccessModule, McpToolsModule],
  providers: [WorkOsMcpServerFactory, McpFirstPartyConnectionService],
  exports: [WorkOsMcpServerFactory, McpFirstPartyConnectionService],
})
export class McpFirstPartyModule {}
