import type { CacheConfig } from '@/chat/config/cache-config.type';
import cacheConfig from '@/chat/config/cache.config';

import { Redis } from 'ioredis';

describe('캐시 Redis 통합', () => {
  it('cache Redis에 연결해 PONG을 받는다', async () => {
    const config = cacheConfig() as CacheConfig;
    const client = new Redis(config.redisUrl, {
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
