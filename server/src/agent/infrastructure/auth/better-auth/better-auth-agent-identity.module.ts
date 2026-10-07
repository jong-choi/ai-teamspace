import { Module } from '@nestjs/common';

import { AgentIdentityProvider } from '@/agent/infrastructure/auth/agent-identity.provider';
import { BetterAuthAgentIdentityAdapter } from '@/agent/infrastructure/auth/better-auth/better-auth-agent-identity.adapter';
import { AuthModule } from '@/auth/auth.module';
import { OrganizationsModule } from '@/organizations/organizations.module';

@Module({
  imports: [AuthModule, OrganizationsModule],
  providers: [
    {
      provide: AgentIdentityProvider,
      useClass: BetterAuthAgentIdentityAdapter,
    },
  ],
  exports: [AgentIdentityProvider],
})
export class BetterAuthAgentIdentityModule {}
