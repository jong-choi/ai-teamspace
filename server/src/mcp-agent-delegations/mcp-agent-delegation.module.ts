import { Module } from '@nestjs/common';

import { WorkOsMcpAuthProviderFactory } from '@/agent/infrastructure/mcp/workos-mcp-auth-provider.factory';
import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { CredentialCryptoModule } from '@/credential-crypto/credential-crypto.module';
import { McpAgentDelegationCredentialService } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import { McpAgentDelegationController } from '@/mcp-agent-delegations/mcp-agent-delegation.controller';
import { McpAgentDelegationService } from '@/mcp-agent-delegations/mcp-agent-delegation.service';
import { McpAgentDelegationWorkOsAuthProviderFactory } from '@/mcp-agent-delegations/mcp-agent-delegation-workos-auth-provider.factory';
import { McpAgentOauthFlowService } from '@/mcp-agent-delegations/mcp-agent-oauth-flow.service';
import { BetterAuthMcpAgentTokenRevocationAdapter } from '@/mcp-agent-delegations/infrastructure/oauth-server/better-auth/better-auth-mcp-agent-token-revocation.adapter';
import { McpAgentTokenRevocationProvider } from '@/mcp-agent-delegations/infrastructure/oauth-server/mcp-agent-token-revocation.provider';
import { McpAgentDelegationDrizzlePersistenceModule } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { OrganizationsModule } from '@/organizations/organizations.module';

@Module({
  imports: [
    AuthModule,
    CredentialCryptoModule,
    McpAgentDelegationDrizzlePersistenceModule,
    OrganizationsModule,
  ],
  controllers: [McpAgentDelegationController],
  providers: [
    McpAgentDelegationCredentialService,
    McpAgentDelegationService,
    McpAgentDelegationWorkOsAuthProviderFactory,
    McpAgentOauthFlowService,
    TrustedOriginGuard,
    {
      provide: McpAgentTokenRevocationProvider,
      useClass: BetterAuthMcpAgentTokenRevocationAdapter,
    },
    {
      provide: WorkOsMcpAuthProviderFactory,
      useExisting: McpAgentDelegationWorkOsAuthProviderFactory,
    },
  ],
  exports: [
    McpAgentDelegationService,
    McpAgentDelegationWorkOsAuthProviderFactory,
    WorkOsMcpAuthProviderFactory,
  ],
})
export class McpAgentDelegationModule {}
