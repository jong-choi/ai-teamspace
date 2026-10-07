import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { BetterAuthMcpAccessKeyAuthenticatorAdapter } from '@/mcp-access-keys/infrastructure/better-auth/better-auth-mcp-access-key-authenticator.adapter';
import { McpAccessKeyAuthenticator } from '@/mcp-access-keys/mcp-access-key-authenticator.provider';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: McpAccessKeyAuthenticator,
      useClass: BetterAuthMcpAccessKeyAuthenticatorAdapter,
    },
  ],
  exports: [McpAccessKeyAuthenticator],
})
export class BetterAuthMcpAccessKeyAuthenticatorModule {}
