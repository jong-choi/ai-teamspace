import { Module } from '@nestjs/common';

import { McpCredentialProvider } from '@/agent/infrastructure/mcp/mcp-credential.provider';
import { UnavailableMcpCredentialAdapter } from '@/agent/infrastructure/mcp/unavailable/unavailable-mcp-credential.adapter';

@Module({
  providers: [
    {
      provide: McpCredentialProvider,
      useClass: UnavailableMcpCredentialAdapter,
    },
  ],
  exports: [McpCredentialProvider],
})
export class UnavailableMcpCredentialModule {}
