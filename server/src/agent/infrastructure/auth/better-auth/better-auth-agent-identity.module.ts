import { Module } from '@nestjs/common';

import { AgentIdentityProvider } from '@/agent/infrastructure/auth/agent-identity.provider';
import { BetterAuthAgentIdentityAdapter } from '@/agent/infrastructure/auth/better-auth/better-auth-agent-identity.adapter';
import { AuthModule } from '@/auth/auth.module';

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
