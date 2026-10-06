import { Module } from '@nestjs/common';

import { AgentAuthorizationPolicy } from '@/agent/application/agent-authorization.policy';
import { WorkOsAgentFactory } from '@/agent/application/workos-agent.factory';
import { AgentConfigurationModule } from '@/agent/config/agent-configuration.module';
import { BetterAuthAgentIdentityModule } from '@/agent/infrastructure/auth/better-auth/better-auth-agent-identity.module';
import { DeepAgentModule } from '@/agent/infrastructure/deep-agent/deep-agent.module';
import { AgentRuntimeOptionsFactory } from '@/agent/infrastructure/runtime/agent-runtime-options.factory';

@Module({
  imports: [
    AgentConfigurationModule,
    BetterAuthAgentIdentityModule,
    DeepAgentModule,
  ],
  providers: [
    AgentAuthorizationPolicy,
    WorkOsAgentFactory,
    AgentRuntimeOptionsFactory,
  ],
  exports: [AgentRuntimeOptionsFactory],
})
export class AgentRuntimeInfrastructureModule {}
