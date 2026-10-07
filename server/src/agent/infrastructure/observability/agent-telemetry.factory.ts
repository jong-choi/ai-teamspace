import { Injectable } from '@nestjs/common';

import type { TelemetrySink } from '@repo/agent-runtime/core';
import { AgentConfiguration } from '@/agent/config/agent-configuration';
import { LangfuseAgentTelemetryAdapter } from '@/agent/infrastructure/observability/langfuse/langfuse-agent-telemetry.adapter';

@Injectable()
export class AgentTelemetryFactory {
  constructor(private readonly configuration: AgentConfiguration) {}

  create(): TelemetrySink | undefined {
    const langfuse = this.configuration.observability?.langfuse;
    if (!langfuse?.enabled) return undefined;
    return new LangfuseAgentTelemetryAdapter(langfuse);
  }
}
