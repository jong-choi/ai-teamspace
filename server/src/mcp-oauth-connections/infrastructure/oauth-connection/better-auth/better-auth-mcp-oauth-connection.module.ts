import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { BetterAuthMcpOAuthConnectionAdapter } from '@/mcp-oauth-connections/infrastructure/oauth-connection/better-auth/better-auth-mcp-oauth-connection.adapter';
import { McpOAuthConnectionProvider } from '@/mcp-oauth-connections/infrastructure/oauth-connection/mcp-oauth-connection.provider';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: McpOAuthConnectionProvider,
      useClass: BetterAuthMcpOAuthConnectionAdapter,
    },
  ],
  exports: [McpOAuthConnectionProvider],
})
export class BetterAuthMcpOAuthConnectionModule {}
