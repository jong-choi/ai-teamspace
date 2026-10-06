import {
  databaseUrlSchema,
  httpUrlSchema,
  redisUrlSchema,
} from '@/config/validation';
import type { AgentConfig } from '@/agent/config/agent-config.type';
import validateConfig from '@/utils/validate-config';

import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const agentConfigSchema = z.object({
  AGENT_DATABASE_URL: databaseUrlSchema,
  AGENT_REDIS_URL: redisUrlSchema,
  AGENT_REDIS_PREFIX: z.string().trim().min(1),
  AGENT_MODEL: z.string().trim().min(1),
  WORKOS_MCP_URL: httpUrlSchema,
  AGENT_MCP_TOOL_TIMEOUT_MS: z.coerce.number().int().min(1).default(30_000),
  AGENT_RUN_QUEUE_NAME: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !value.includes(':'), {
      message: 'AGENT_RUN_QUEUE_NAME에는 콜론(:)을 사용할 수 없습니다.',
    }),
  AGENT_RUN_CONCURRENCY: z.coerce.number().int().min(1).default(4),
  AGENT_RUN_TIMEOUT_MS: z.coerce.number().int().min(1).default(300_000),
  AGENT_SHUTDOWN_GRACE_MS: z.coerce.number().int().min(0).default(30_000),
  AGENT_MIGRATE_ON_STARTUP: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  AGENT_REPLAY_STREAM_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .default(3_600),
  AGENT_REPLAY_CLOSED_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .default(86_400),
  AGENT_REPLAY_STREAM_MAXLEN: z.coerce.number().int().min(1).default(10_000),
  AGENT_REPLAY_SUBSCRIBER_BUFFER_FRAMES: z.coerce
    .number()
    .int()
    .min(1)
    .default(512),
});

export default registerAs<AgentConfig>('agent', () => {
  const environment = validateConfig(process.env, agentConfigSchema);

  return {
    databaseUrl: environment.AGENT_DATABASE_URL,
    redisUrl: environment.AGENT_REDIS_URL,
    redisPrefix: environment.AGENT_REDIS_PREFIX,
    model: environment.AGENT_MODEL,
    workOsMcpUrl: environment.WORKOS_MCP_URL,
    mcpToolTimeoutMs: environment.AGENT_MCP_TOOL_TIMEOUT_MS,
    runQueueName: environment.AGENT_RUN_QUEUE_NAME,
    runConcurrency: environment.AGENT_RUN_CONCURRENCY,
    runTimeoutMs: environment.AGENT_RUN_TIMEOUT_MS,
    shutdownGraceMs: environment.AGENT_SHUTDOWN_GRACE_MS,
    migrateOnStartup: environment.AGENT_MIGRATE_ON_STARTUP,
    replayStreamTtlSeconds: environment.AGENT_REPLAY_STREAM_TTL_SECONDS,
    replayClosedTtlSeconds: environment.AGENT_REPLAY_CLOSED_TTL_SECONDS,
    replayStreamMaxLength: environment.AGENT_REPLAY_STREAM_MAXLEN,
    replaySubscriberBufferFrames:
      environment.AGENT_REPLAY_SUBSCRIBER_BUFFER_FRAMES,
  };
});
