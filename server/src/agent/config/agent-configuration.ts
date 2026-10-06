import type { AgentConfig } from '@/agent/config/agent-config.type';

export interface AgentMcpConfiguration {
  url: string;
  toolTimeoutMs: number;
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
  constructor(private readonly config: AgentConfig) {}

  get modelSpec(): string {
    return this.config.model;
  }

  get mcp(): AgentMcpConfiguration {
    return {
      url: this.config.workOsMcpUrl,
      toolTimeoutMs: this.config.mcpToolTimeoutMs,
    };
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
