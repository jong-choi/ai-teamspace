import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import {
  WikiCollaborationAttributionProvider,
  type WikiCollaborationAttributionSnapshot,
} from '@/wiki/infrastructure/collaboration/wiki-collaboration-attribution.provider';

import { Redis } from 'ioredis';

const keyPrefix = 'wiki:collaboration:attribution';
const memberSeparator = '\u0000';

@Injectable()
export class RedisWikiCollaborationAttributionAdapter
  extends WikiCollaborationAttributionProvider
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

  async checkReady(): Promise<void> {
    await this.redis.ping();
  }

  async record(documentName: string, userId: string): Promise<void> {
    const sequence = await this.redis.incr(sequenceKey(documentName));
    await this.redis.zadd(
      eventsKey(documentName),
      sequence,
      `${sequence}${memberSeparator}${userId}`,
    );
  }

  async snapshot(
    documentName: string,
  ): Promise<WikiCollaborationAttributionSnapshot> {
    const values = await this.redis.zrange(
      eventsKey(documentName),
      0,
      -1,
      'WITHSCORES',
    );
    const collaboratorUserIds: string[] = [];
    const seen = new Set<string>();
    let lastEditorUserId: string | null = null;
    let maxSequence: number | null = null;

    for (let index = 0; index < values.length; index += 2) {
      const member = values[index];
      const score = values[index + 1];
      if (member === undefined || score === undefined) {
        continue;
      }
      const separatorIndex = member.indexOf(memberSeparator);
      if (separatorIndex < 0) {
        continue;
      }
      const userId = member.slice(separatorIndex + memberSeparator.length);
      const sequence = Number.parseInt(score, 10);
      if (!Number.isSafeInteger(sequence) || userId.length === 0) {
        continue;
      }
      if (!seen.has(userId)) {
        seen.add(userId);
        collaboratorUserIds.push(userId);
      }
      lastEditorUserId = userId;
      maxSequence = sequence;
    }

    return { lastEditorUserId, collaboratorUserIds, maxSequence };
  }

  async clearThrough(documentName: string, maxSequence: number): Promise<void> {
    await this.redis.zremrangebyscore(
      eventsKey(documentName),
      '-inf',
      String(maxSequence),
    );
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}

function sequenceKey(documentName: string): string {
  return `${keyPrefix}:sequence:${documentName}`;
}

function eventsKey(documentName: string): string {
  return `${keyPrefix}:events:${documentName}`;
}
