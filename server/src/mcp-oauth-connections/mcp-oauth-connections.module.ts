import { Module } from '@nestjs/common';

import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { BetterAuthMcpOAuthConnectionModule } from '@/mcp-oauth-connections/infrastructure/oauth-connection/better-auth/better-auth-mcp-oauth-connection.module';
import { McpOAuthConnectionsController } from '@/mcp-oauth-connections/mcp-oauth-connections.controller';
import { McpOAuthConnectionsService } from '@/mcp-oauth-connections/mcp-oauth-connections.service';

@Module({
  imports: [BetterAuthMcpOAuthConnectionModule],
  controllers: [McpOAuthConnectionsController],
  providers: [McpOAuthConnectionsService, TrustedOriginGuard],
  exports: [McpOAuthConnectionsService],
})
export class McpOAuthConnectionsModule {}
