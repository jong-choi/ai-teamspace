import { Module } from '@nestjs/common';

import { AgentIdentityProvider } from '#server/agent/infrastructure/auth/agent-identity.provider.js';
import { BetterAuthAgentIdentityAdapter } from '#server/agent/infrastructure/auth/better-auth/better-auth-agent-identity.adapter.js';
import { AuthModule } from '#server/auth/auth.module.js';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: AgentIdentityProvider,
      useClass: BetterAuthAgentIdentityAdapter,
    },
  ],
  exports: [AgentIdentityProvider],
})
export class BetterAuthAgentIdentityModule {}
