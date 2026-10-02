import type { JobsOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';

export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: {
    count: 1_000,
  },
  removeOnFail: {
    count: 10_000,
  },
} as const satisfies JobsOptions;

function parseDatabase(pathname: string): number {
  if (pathname === '' || pathname === '/') {
    return 0;
  }

  const database = Number(pathname.slice(1));
  if (!Number.isInteger(database) || database < 0) {
    throw new Error('Redis database index가 올바르지 않습니다.');
  }

  return database;
}

export function createRedisOptions(urlValue: string): RedisOptions {
  const url = new URL(urlValue);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: parseDatabase(url.pathname),
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

export function createProducerRedisOptions(urlValue: string): RedisOptions {
  return {
    ...createRedisOptions(urlValue),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  };
}

export function createWorkerRedisOptions(urlValue: string): RedisOptions {
  return {
    ...createRedisOptions(urlValue),
    maxRetriesPerRequest: null,
  };
}
