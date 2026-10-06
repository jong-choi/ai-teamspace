import 'dotenv/config';

import {
  databaseUrlSchema,
  redisUrlSchema,
  urlWithProtocols,
} from '@/config/runtime-environment';

import { z } from 'zod';

const workOsMcpUrlSchema = urlWithProtocols(
  ['http:', 'https:'],
  'WORKOS_MCP_URL은 http:// 또는 https:// 형식이어야 합니다.',
);

export const agentEnvironmentSchema = z.object({
  AGENT_DATABASE_URL: databaseUrlSchema,
  AGENT_REDIS_URL: redisUrlSchema,
  AGENT_REDIS_PREFIX: z.string().trim().min(1),
  AGENT_MODEL: z.string().trim().min(1),
  WORKOS_MCP_URL: workOsMcpUrlSchema,
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

export type AgentEnvironment = z.infer<typeof agentEnvironmentSchema>;

export function parseAgentEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): AgentEnvironment {
  return agentEnvironmentSchema.parse(environment);
}
