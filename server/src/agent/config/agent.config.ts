import { registerAs } from '@nestjs/config';

import type { AgentConfig } from '@/agent/config/agent-config.type';
import {
  databaseUrlSchema,
  httpUrlSchema,
  isHttpsOrLoopbackHttp,
  ollamaOriginUrlSchema,
  redisUrlSchema,
} from '@/config/validation';
import validateConfig from '@/utils/validate-config';

import { z } from 'zod';

const optionalTrimmedStringSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalHttpUrlSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? undefined : value,
  httpUrlSchema.optional(),
);

const agentConfigSchema = z
  .object({
    AGENT_DATABASE_URL: databaseUrlSchema,
    AGENT_REDIS_URL: redisUrlSchema,
    AGENT_REDIS_PREFIX: z.string().trim().min(1),
    AGENT_MODEL: z.string().trim().min(1),
    OLLAMA_API_KEY: z.string().trim().min(1),
    OLLAMA_BASE_URL: ollamaOriginUrlSchema,
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
    LANGFUSE_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    LANGFUSE_BASE_URL: optionalHttpUrlSchema.refine(
      (value) => value === undefined || isHttpsOrLoopbackHttp(new URL(value)),
      'LANGFUSE_BASE_URL은 HTTPS여야 하며 로컬 개발에서는 loopback HTTP만 허용됩니다.',
    ),
    LANGFUSE_PUBLIC_KEY: optionalTrimmedStringSchema,
    LANGFUSE_SECRET_KEY: optionalTrimmedStringSchema,
    LANGFUSE_TRACING_ENVIRONMENT: z
      .string()
      .trim()
      .min(1)
      .default('development'),
    LANGFUSE_RELEASE: optionalTrimmedStringSchema,
    LANGFUSE_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
    LANGFUSE_CAPTURE_LEVEL: z
      .enum(['metadata', 'sanitized-content'])
      .default('metadata'),
    LANGFUSE_ID_HASH_SECRET: optionalTrimmedStringSchema,
  })
  .superRefine((environment, context) => {
    if (!environment.LANGFUSE_ENABLED) return;

    const required = [
      ['LANGFUSE_BASE_URL', environment.LANGFUSE_BASE_URL],
      ['LANGFUSE_PUBLIC_KEY', environment.LANGFUSE_PUBLIC_KEY],
      ['LANGFUSE_SECRET_KEY', environment.LANGFUSE_SECRET_KEY],
      ['LANGFUSE_ID_HASH_SECRET', environment.LANGFUSE_ID_HASH_SECRET],
    ] as const;

    for (const [key, value] of required) {
      if (value !== undefined) continue;
      context.addIssue({
        code: 'custom',
        path: [key],
        message: `${key}는 LANGFUSE_ENABLED=true일 때 필수입니다.`,
      });
    }

    if (
      environment.LANGFUSE_ID_HASH_SECRET !== undefined &&
      Buffer.byteLength(environment.LANGFUSE_ID_HASH_SECRET, 'utf8') < 32
    ) {
      context.addIssue({
        code: 'custom',
        path: ['LANGFUSE_ID_HASH_SECRET'],
        message:
          'LANGFUSE_ID_HASH_SECRET은 UTF-8 기준 최소 32바이트여야 합니다.',
      });
    }
  });

export default registerAs<AgentConfig>('agent', () => {
  const environment = validateConfig(process.env, agentConfigSchema);

  return {
    databaseUrl: environment.AGENT_DATABASE_URL,
    redisUrl: environment.AGENT_REDIS_URL,
    redisPrefix: environment.AGENT_REDIS_PREFIX,
    model: {
      name: environment.AGENT_MODEL,
      baseUrl: environment.OLLAMA_BASE_URL,
      apiKey: environment.OLLAMA_API_KEY,
    },
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
    observability: {
      langfuse: {
        enabled: environment.LANGFUSE_ENABLED,
        baseUrl: environment.LANGFUSE_BASE_URL,
        publicKey: environment.LANGFUSE_PUBLIC_KEY,
        secretKey: environment.LANGFUSE_SECRET_KEY,
        tracingEnvironment: environment.LANGFUSE_TRACING_ENVIRONMENT,
        release: environment.LANGFUSE_RELEASE,
        sampleRate: environment.LANGFUSE_SAMPLE_RATE,
        captureLevel: environment.LANGFUSE_CAPTURE_LEVEL,
        idHashSecret: environment.LANGFUSE_ID_HASH_SECRET,
      },
    },
  };
});
