import type { AgentConfig } from '@/agent/config/agent-config.type';
import type { McpConfig } from '@/mcp/config/mcp-config.type';

export interface AgentMcpConfiguration {
  url: string;
  toolTimeoutMs: number;
}

export interface AgentModelConfiguration {
  name: string;
  baseUrl: string;
  apiKey: string;
}

export interface AgentDurableConfiguration {
  postgresUri: string;
  redisUri: string;
  redisPrefix: string;
  runQueueName: string;
  runConcurrency: number;
  runTimeoutMs: number;
  migrateOnStartup: boolean;
  replay: {
    streamTtlSeconds: number;
    closedMarkerTtlSeconds: number;
    streamMaxLen: number;
    subscriberBufferFrames: number;
  };
}

export interface AgentWorkerConfiguration {
  maxConcurrency: number;
  shutdownGraceMs: number;
}

export class AgentConfiguration {
  constructor(
    private readonly config: AgentConfig,
    private readonly mcpConfig: Pick<McpConfig, 'resourceUrl'>,
  ) {}

  get model(): AgentModelConfiguration {
    return this.config.model;
  }

  get mcp(): AgentMcpConfiguration {
    return {
      url: this.mcpConfig.resourceUrl,
      toolTimeoutMs: this.config.mcpToolTimeoutMs,
    };
  }

  get observability(): AgentConfig['observability'] {
    return this.config.observability;
  }

  get durable(): AgentDurableConfiguration {
    return {
      postgresUri: this.config.databaseUrl,
      redisUri: this.config.redisUrl,
      redisPrefix: this.config.redisPrefix,
      runQueueName: this.config.runQueueName,
      runConcurrency: this.config.runConcurrency,
      runTimeoutMs: this.config.runTimeoutMs,
      migrateOnStartup: this.config.migrateOnStartup,
      replay: {
        streamTtlSeconds: this.config.replayStreamTtlSeconds,
        closedMarkerTtlSeconds: this.config.replayClosedTtlSeconds,
        streamMaxLen: this.config.replayStreamMaxLength,
        subscriberBufferFrames: this.config.replaySubscriberBufferFrames,
      },
    };
  }

  get worker(): AgentWorkerConfiguration {
    return {
      maxConcurrency: this.config.runConcurrency,
      shutdownGraceMs: this.config.shutdownGraceMs,
    };
  }
}
