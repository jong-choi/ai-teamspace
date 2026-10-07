import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { McpHttpHandler } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-http.handler';
import { McpHttpSecurityGuard } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-http-security.guard';
import { McpNodeAdapter } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-node.adapter';
import { McpController } from '@/mcp/mcp.controller';
import { WorkOsMcpServerFactory } from '@/mcp/mcp-server.factory';
import { McpToolsModule } from '@/mcp/tools/mcp-tools.module';
import { McpAccessKeysModule } from '@/mcp-access-keys/mcp-access-keys.module';
import { McpOAuthConnectionsModule } from '@/mcp-oauth-connections/mcp-oauth-connections.module';

@Module({
  imports: [
    AuthModule,
    McpAccessKeysModule,
    McpOAuthConnectionsModule,
    McpToolsModule,
  ],
  controllers: [McpController],
  providers: [
    McpHttpHandler,
    McpHttpSecurityGuard,
    McpNodeAdapter,
    WorkOsMcpServerFactory,
  ],
})
export class McpModule {}
