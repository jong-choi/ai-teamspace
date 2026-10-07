import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentMcpConnectionsController } from '@/agent-mcp-connections/agent-mcp-connections.controller';
import { AgentMcpConnectionsService } from '@/agent-mcp-connections/application/agent-mcp-connections.service';
import { AgentMcpCredentialModule } from '@/agent-mcp-connections/application/agent-mcp-credential.module';
import { AgentMcpAuditModule } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.module';
import { ExternalMcpModule } from '@/agent-mcp-connections/infrastructure/mcp/external-mcp.module';
import { AgentMcpConnectionPersistenceModule } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection-persistence.module';
import { OrganizationsModule } from '@/organizations/organizations.module';

@Module({
  imports: [
    ConfigModule,
    OrganizationsModule,
    AgentMcpAuditModule,
    AgentMcpConnectionPersistenceModule,
    AgentMcpCredentialModule,
    ExternalMcpModule,
  ],
  controllers: [AgentMcpConnectionsController],
  providers: [AgentMcpConnectionsService],
})
export class AgentMcpConnectionsModule {}
