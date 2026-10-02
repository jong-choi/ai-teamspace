import 'dotenv/config';

import { z } from 'zod';

function urlWithProtocols(protocols: readonly string[], message: string) {
  return z
    .string()
    .min(1)
    .refine((value) => {
      try {
        return protocols.includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, message);
}

const databaseUrlSchema = urlWithProtocols(
  ['postgres:', 'postgresql:'],
  'DATABASE_URL은 postgres:// 또는 postgresql:// 형식이어야 합니다.',
);

const httpUrlSchema = urlWithProtocols(
  ['http:', 'https:'],
  'BETTER_AUTH_URL은 http:// 또는 https:// 형식이어야 합니다.',
);

const redisUrlSchema = urlWithProtocols(
  ['redis:', 'rediss:'],
  'Redis URL은 redis:// 또는 rediss:// 형식이어야 합니다.',
);

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
});

export const authEnvironmentSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: httpUrlSchema,
});

export const apiEnvironmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export const queueEnvironmentSchema = z.object({
  REDIS_QUEUE_URL: redisUrlSchema,
  BULLMQ_PREFIX: z.string().trim().min(1),
});

export const cacheEnvironmentSchema = z.object({
  REDIS_CACHE_URL: redisUrlSchema,
});

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;
export type AuthEnvironment = z.infer<typeof authEnvironmentSchema>;
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type QueueEnvironment = z.infer<typeof queueEnvironmentSchema>;
export type CacheEnvironment = z.infer<typeof cacheEnvironmentSchema>;

export function parseDatabaseEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment {
  return databaseEnvironmentSchema.parse(environment);
}

export function parseAuthEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): AuthEnvironment {
  return authEnvironmentSchema.parse(environment);
}

export function parseApiEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ApiEnvironment {
  return apiEnvironmentSchema.parse(environment);
}

export function parseQueueEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): QueueEnvironment {
  return queueEnvironmentSchema.parse(environment);
}

export function parseCacheEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): CacheEnvironment {
  return cacheEnvironmentSchema.parse(environment);
}
