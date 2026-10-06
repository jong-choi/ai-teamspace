import { Module } from '@nestjs/common';

import { McpCredentialProvider } from '#server/agent/infrastructure/mcp/mcp-credential.provider.js';
import { UnavailableMcpCredentialAdapter } from '#server/agent/infrastructure/mcp/unavailable/unavailable-mcp-credential.adapter.js';

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
