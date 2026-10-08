import { Redis } from 'ioredis';

/**
 * 공유 Redis에서 test가 소유한 namespace의 key만 SCAN + UNLINK로 정리한다.
 * `FLUSHDB`처럼 다른 개발/test 데이터를 지우는 정리는 사용하지 않는다.
 */
export async function deleteRedisTestKeys(
  redisUrl: string,
  patterns: readonly string[],
): Promise<void> {
  const redis = new Redis(redisUrl);
  try {
    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          200,
        );
        cursor = nextCursor;
        if (keys.length > 0) await redis.unlink(...keys);
      } while (cursor !== '0');
    }
  } finally {
    await redis.quit();
  }
}
