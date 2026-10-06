import { Module } from '@nestjs/common';

import { AgentAuthorizationPolicy } from '#server/agent/application/agent-authorization.policy.js';
import { WorkOsAgentFactory } from '#server/agent/application/workos-agent.factory.js';
import { AgentConfigurationModule } from '#server/agent/config/agent-configuration.module.js';
import { BetterAuthAgentIdentityModule } from '#server/agent/infrastructure/auth/better-auth/better-auth-agent-identity.module.js';
import { DeepAgentModule } from '#server/agent/infrastructure/deep-agent/deep-agent.module.js';
import { AgentRuntimeOptionsFactory } from '#server/agent/infrastructure/runtime/agent-runtime-options.factory.js';

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
