import { Injectable } from '@nestjs/common';

import {
  adaptAgentAuth,
  type AgentRuntimeConfiguration as RuntimeModuleConfiguration,
  createDurableAgentRuntime,
} from '@repo/agent-runtime';
import { AgentAuthorizationPolicy } from '@/agent/application/agent-authorization.policy';
import { WORKOS_AGENT_NAME } from '@/agent/application/workos-agent.definition';
import { WorkOsAgentFactory } from '@/agent/application/workos-agent.factory';
import { AgentConfiguration } from '@/agent/config/agent-configuration';

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
