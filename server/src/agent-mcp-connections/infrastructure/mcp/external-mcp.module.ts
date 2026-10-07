import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentMcpCredentialModule } from '@/agent-mcp-connections/application/agent-mcp-credential.module';
import { AgentMcpOauthService } from '@/agent-mcp-connections/application/agent-mcp-oauth.service';
import { ExternalMcpToolPolicy } from '@/agent-mcp-connections/application/external-mcp-tool.policy';
import { AgentMcpAuditModule } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.module';
import { SafeOutboundHttpModule } from '@/agent-mcp-connections/infrastructure/http/safe-outbound-http.module';
import { ExternalMcpConnectionSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-connection-session.provider';
import { ExternalMcpDiscoveryProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-discovery.provider';
import { ExternalMcpToolSessionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-tool-session.adapter';
import { ExternalMcpToolSessionProvider } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp-tool-session.provider';
import { McpSdkExternalMcpConnectionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/mcp-sdk-external-mcp-connection.adapter';
import { AgentMcpConnectionPersistenceModule } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection-persistence.module';

@Module({
  imports: [
    ConfigModule,
    AgentMcpAuditModule,
    AgentMcpConnectionPersistenceModule,
    AgentMcpCredentialModule,
    SafeOutboundHttpModule,
  ],
  providers: [
    AgentMcpOauthService,
    ExternalMcpToolPolicy,
    McpSdkExternalMcpConnectionAdapter,
    {
      provide: ExternalMcpConnectionSessionProvider,
      useExisting: McpSdkExternalMcpConnectionAdapter,
    },
    {
      provide: ExternalMcpDiscoveryProvider,
      useExisting: McpSdkExternalMcpConnectionAdapter,
    },
    {
      provide: ExternalMcpToolSessionProvider,
      useClass: ExternalMcpToolSessionAdapter,
    },
  ],
  exports: [
    AgentMcpOauthService,
    ExternalMcpDiscoveryProvider,
    ExternalMcpToolSessionProvider,
  ],
})
export class ExternalMcpModule {}
