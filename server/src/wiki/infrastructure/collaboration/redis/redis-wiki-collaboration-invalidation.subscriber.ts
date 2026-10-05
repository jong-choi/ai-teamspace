import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';

import { WIKI_COLLABORATION_INVALIDATION_CHANNEL } from '#server/wiki/infrastructure/collaboration/redis/redis-wiki-collaboration-invalidation.publisher.js';
import {
  WIKI_COLLABORATION_ENVIRONMENT,
  type WikiCollaborationEnvironment,
} from '#server/wiki/infrastructure/collaboration/wiki-collaboration-configuration.provider.js';
import {
  WikiCollaborationInvalidationEventSchema,
  WikiCollaborationInvalidationSubscriber,
} from '#server/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider.js';

import { Redis } from 'ioredis';

@Injectable()
export class RedisWikiCollaborationInvalidationSubscriber
  extends WikiCollaborationInvalidationSubscriber
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(
    RedisWikiCollaborationInvalidationSubscriber.name,
  );
  private readonly redis: Redis;
  private cleanup: (() => Promise<void>) | null = null;

  constructor(
    @Inject(WIKI_COLLABORATION_ENVIRONMENT)
    environment: WikiCollaborationEnvironment,
  ) {
    super();
    this.redis = new Redis(environment.REDIS_COLLABORATION_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  async subscribe(
    handler: Parameters<
      WikiCollaborationInvalidationSubscriber['subscribe']
    >[0],
  ): Promise<() => Promise<void>> {
    if (this.cleanup) {
      return this.cleanup;
    }

    const messageHandler = (_channel: string, raw: string) => {
      try {
        const parsedJson: unknown = JSON.parse(raw);
        const event =
          WikiCollaborationInvalidationEventSchema.parse(parsedJson);
        void Promise.resolve(handler(event)).catch((error: unknown) => {
          this.logger.error(
            '위키 공동편집 invalidation 처리에 실패했습니다.',
            error,
          );
        });
      } catch (error) {
        this.logger.warn(
          '잘못된 위키 공동편집 invalidation payload를 무시합니다.',
        );
        this.logger.debug(error);
      }
    };

    this.redis.on('message', messageHandler);
    await this.redis.subscribe(WIKI_COLLABORATION_INVALIDATION_CHANNEL);
    this.cleanup = async () => {
      this.redis.off('message', messageHandler);
      await this.redis.unsubscribe(WIKI_COLLABORATION_INVALIDATION_CHANNEL);
      this.cleanup = null;
    };
    return this.cleanup;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.cleanup) {
      await this.cleanup();
    }
    await this.redis.quit();
  }
}
