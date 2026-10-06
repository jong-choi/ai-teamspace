import { parseCollaborationEnvironment } from '@/config/runtime-environment';
import { RedisWikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation.publisher';
import { RedisWikiCollaborationInvalidationSubscriber } from '@/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation.subscriber';
import type { WikiCollaborationInvalidationEvent } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';

describe('위키 공동편집 Redis invalidation 통합', () => {
  it('publisher 이벤트를 subscriber까지 전달한다', async () => {
    const environment = parseCollaborationEnvironment();
    const publisher = new RedisWikiCollaborationInvalidationPublisher(
      environment,
    );
    const subscriber = new RedisWikiCollaborationInvalidationSubscriber(
      environment,
    );
    const expected: WikiCollaborationInvalidationEvent = {
      scope: 'organization-user',
      organizationId: 'organization-a',
      userId: 'user-a',
    };
    let resolveReceived: (
      event: WikiCollaborationInvalidationEvent,
    ) => void = () => undefined;
    const received = new Promise<WikiCollaborationInvalidationEvent>(
      (resolve) => {
        resolveReceived = resolve;
      },
    );

    try {
      await subscriber.subscribe((event) => resolveReceived(event));
      await publisher.publish(expected);

      await expect(withTimeout(received, 2_000)).resolves.toEqual(expected);
    } finally {
      await subscriber.onApplicationShutdown();
      await publisher.onApplicationShutdown();
    }
  });
});

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error('Redis invalidation 수신 제한 시간을 초과했습니다.'),
            ),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
