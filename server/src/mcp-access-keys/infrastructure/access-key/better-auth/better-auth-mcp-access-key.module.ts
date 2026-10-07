import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { BetterAuthMcpAccessKeyAdapter } from '@/mcp-access-keys/infrastructure/access-key/better-auth/better-auth-mcp-access-key.adapter';
import { McpAccessKeyProvider } from '@/mcp-access-keys/infrastructure/access-key/mcp-access-key.provider';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: McpAccessKeyProvider,
      useClass: BetterAuthMcpAccessKeyAdapter,
    },
  ],
  exports: [McpAccessKeyProvider],
})
export class BetterAuthMcpAccessKeyModule {}
