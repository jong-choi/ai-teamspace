import { Injectable } from '@nestjs/common';

import {
  adaptAgentAuth,
  type AgentRuntimeConfiguration as RuntimeModuleConfiguration,
  createDurableAgentRuntime,
} from '@repo/agent-runtime';
import { AgentAuthorizationPolicy } from '#server/agent/application/agent-authorization.policy.js';
import { WORKOS_AGENT_NAME } from '#server/agent/application/workos-agent.definition.js';
import { WorkOsAgentFactory } from '#server/agent/application/workos-agent.factory.js';
import { AgentConfiguration } from '#server/agent/config/agent-configuration.js';

@Injectable()
export class AgentRuntimeOptionsFactory {
  constructor(
    private readonly configuration: AgentConfiguration,
    private readonly authorization: AgentAuthorizationPolicy,
    private readonly agents: WorkOsAgentFactory,
  ) {}

  async create(): Promise<RuntimeModuleConfiguration> {
    const durableConfiguration = this.configuration.durable;
    const auth = adaptAgentAuth(this.authorization.create());
    const durable = await createDurableAgentRuntime(
      { [WORKOS_AGENT_NAME]: this.agents.createGraphFactory() },
      {
        ...durableConfiguration,
        overrides: { auth },
      },
    );

    return {
      runtime: {
        deps: durable.deps,
        worker: this.configuration.worker,
      },
      dispose: () => durable.dispose(),
    };
  }
}
