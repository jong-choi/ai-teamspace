import { Module } from '@nestjs/common';

import { AgentMcpCredentialService } from '@/agent-mcp-connections/application/agent-mcp-credential.service';
import { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import { AgentMcpOauthStateService } from '@/agent-mcp-connections/application/agent-mcp-oauth-state.service';
import { AgentMcpAuditModule } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.module';
import { AgentMcpConnectionPersistenceModule } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection-persistence.module';
import { CredentialCryptoModule } from '@/credential-crypto/credential-crypto.module';

@Module({
  imports: [
    AgentMcpAuditModule,
    AgentMcpConnectionPersistenceModule,
    CredentialCryptoModule,
  ],
  providers: [
    AgentMcpCredentialService,
    AgentMcpOauthCredentialService,
    AgentMcpOauthStateService,
  ],
  exports: [
    AgentMcpCredentialService,
    AgentMcpOauthCredentialService,
    AgentMcpOauthStateService,
  ],
})
export class AgentMcpCredentialModule {}
