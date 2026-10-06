import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';

import {
  WIKI_COLLABORATION_ENVIRONMENT,
  type WikiCollaborationEnvironment,
} from '@/wiki/infrastructure/collaboration/wiki-collaboration-configuration.provider';
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
