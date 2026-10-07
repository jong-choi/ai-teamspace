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
import { AgentTelemetryFactory } from '@/agent/infrastructure/observability/agent-telemetry.factory';

@Injectable()
export class AgentRuntimeOptionsFactory {
  constructor(
    private readonly configuration: AgentConfiguration,
    private readonly authorization: AgentAuthorizationPolicy,
    private readonly agents: WorkOsAgentFactory,
    private readonly telemetryFactory: AgentTelemetryFactory,
  ) {}

  async create(): Promise<RuntimeModuleConfiguration> {
    const durableConfiguration = this.configuration.durable;
    const auth = adaptAgentAuth(this.authorization.create());
    const telemetry = this.telemetryFactory.create();

    let durable: Awaited<ReturnType<typeof createDurableAgentRuntime>>;
    try {
      durable = await createDurableAgentRuntime(
        { [WORKOS_AGENT_NAME]: this.agents.createGraphFactory() },
        {
          ...durableConfiguration,
          overrides: {
            auth,
            ...(telemetry ? { telemetry } : {}),
          },
        },
      );
    } catch (error) {
      await telemetry?.shutdown?.().catch(() => undefined);
      throw error;
    }

    return {
      runtime: {
        deps: durable.deps,
        worker: this.configuration.worker,
      },
      dispose: async () => {
        let telemetryError: unknown;
        try {
          await telemetry?.shutdown?.();
        } catch (error) {
          telemetryError = error;
        }

        let durableError: unknown;
        try {
          await durable.dispose();
        } catch (error) {
          durableError = error;
        }

        const failures = [telemetryError, durableError].filter(
          (failure) => failure !== undefined,
        );
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1) {
          throw new AggregateError(
            failures,
            'Agent runtime observability/resource dispose failed.',
          );
        }
      },
    };
  }
}
