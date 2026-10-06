import type { AgentEnvironment } from '@/agent/config/agent-environment';

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
  constructor(private readonly environment: AgentEnvironment) {}

  get modelSpec(): string {
    return this.environment.AGENT_MODEL;
  }

  get mcp(): AgentMcpConfiguration {
    return {
      url: this.environment.WORKOS_MCP_URL,
      toolTimeoutMs: this.environment.AGENT_MCP_TOOL_TIMEOUT_MS,
    };
  }

  get durable(): AgentDurableConfiguration {
    return {
      postgresUri: this.environment.AGENT_DATABASE_URL,
      redisUri: this.environment.AGENT_REDIS_URL,
      redisPrefix: this.environment.AGENT_REDIS_PREFIX,
      runQueueName: this.environment.AGENT_RUN_QUEUE_NAME,
      runConcurrency: this.environment.AGENT_RUN_CONCURRENCY,
      runTimeoutMs: this.environment.AGENT_RUN_TIMEOUT_MS,
      migrateOnStartup: this.environment.AGENT_MIGRATE_ON_STARTUP,
      replay: {
        streamTtlSeconds: this.environment.AGENT_REPLAY_STREAM_TTL_SECONDS,
        closedMarkerTtlSeconds:
          this.environment.AGENT_REPLAY_CLOSED_TTL_SECONDS,
        streamMaxLen: this.environment.AGENT_REPLAY_STREAM_MAXLEN,
        subscriberBufferFrames:
          this.environment.AGENT_REPLAY_SUBSCRIBER_BUFFER_FRAMES,
      },
    };
  }

  get worker(): AgentWorkerConfiguration {
    return {
      maxConcurrency: this.environment.AGENT_RUN_CONCURRENCY,
      shutdownGraceMs: this.environment.AGENT_SHUTDOWN_GRACE_MS,
    };
  }
}
