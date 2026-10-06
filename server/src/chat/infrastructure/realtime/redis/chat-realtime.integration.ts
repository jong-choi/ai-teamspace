import { RedisChatRealtimeAdapter } from '@/chat/infrastructure/realtime/redis/chat-realtime.adapter';
import { parseCacheEnvironment } from '@/config/runtime-environment';

import { Redis } from 'ioredis';
import { filter, firstValueFrom, timeout } from 'rxjs';

const userId = 'chat-realtime-integration-user';
const conversationId = '11111111-1111-4111-8111-111111111111';
const channel = `work-os:chat:user:${userId}`;

describe('채팅 Redis 실시간 통합', () => {
  it('서로 다른 Redis 어댑터 인스턴스 사이에서 사용자 이벤트를 전달한다', async () => {
    const publisher = new RedisChatRealtimeAdapter();
    const subscriber = new RedisChatRealtimeAdapter();
    const { REDIS_CACHE_URL } = parseCacheEnvironment();
    const inspector = new Redis(REDIS_CACHE_URL, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    try {
      await inspector.connect();

      const received = firstValueFrom(
        subscriber.events(userId).pipe(
          filter((event) => event.type === 'conversation.changed'),
          timeout({ first: 2_000 }),
        ),
      );
      await waitForSubscription(inspector, channel);

      await publisher.publishConversationChanged([userId], conversationId);

      await expect(received).resolves.toMatchObject({
        type: 'conversation.changed',
        conversationId,
      });
    } finally {
      inspector.disconnect();
      await Promise.allSettled([
        publisher.onApplicationShutdown(),
        subscriber.onApplicationShutdown(),
      ]);
    }
  });
});

async function waitForSubscription(
  redis: Redis,
  subscriptionChannel: string,
): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result: unknown = await redis.call(
      'PUBSUB',
      'NUMSUB',
      subscriptionChannel,
    );
    if (Array.isArray(result) && Number(result[1]) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('채팅 Redis 구독이 제한 시간 안에 준비되지 않았습니다.');
}
