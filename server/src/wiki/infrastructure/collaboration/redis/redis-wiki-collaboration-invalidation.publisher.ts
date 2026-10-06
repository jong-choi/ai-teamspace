import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import {
  type WikiCollaborationInvalidationEvent,
  WikiCollaborationInvalidationEventSchema,
  WikiCollaborationInvalidationPublisher,
} from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';

import { Redis } from 'ioredis';

export const WIKI_COLLABORATION_INVALIDATION_CHANNEL =
  'wiki:collaboration:authorization';

@Injectable()
export class RedisWikiCollaborationInvalidationPublisher
  extends WikiCollaborationInvalidationPublisher
  implements OnApplicationShutdown
{
  private readonly redis: Redis;

  constructor(configService: ConfigService<AllConfigType>) {
    super();
    this.redis = new Redis(
      configService.getOrThrow('collaboration.redisUrl', { infer: true }),
      {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      },
    );
  }

  async publish(event: WikiCollaborationInvalidationEvent): Promise<void> {
    const payload = WikiCollaborationInvalidationEventSchema.parse(event);
    await this.redis.publish(
      WIKI_COLLABORATION_INVALIDATION_CHANNEL,
      JSON.stringify(payload),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
