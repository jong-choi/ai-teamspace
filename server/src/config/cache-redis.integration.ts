import { parseCacheEnvironment } from '#server-source/config/runtime-environment';

import { Redis } from 'ioredis';

describe('캐시 Redis 통합', () => {
  it('cache Redis에 연결해 PONG을 받는다', async () => {
    const { REDIS_CACHE_URL } = parseCacheEnvironment();
    const client = new Redis(REDIS_CACHE_URL, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    try {
      await client.connect();
      await expect(client.ping()).resolves.toBe('PONG');
    } finally {
      await client.quit();
    }
  });
});
