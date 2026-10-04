import { randomUUID } from 'node:crypto';

import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';

import type { ChatMessageResponse } from '#server/chat/dto/chat-message.dto.js';
import {
  type ChatRealtimeEvent,
  ChatRealtimeEventSchema,
} from '#server/chat/infrastructure/realtime/chat-realtime.event.js';
import { ChatRealtimeProvider } from '#server/chat/infrastructure/realtime/chat-realtime.provider.js';
import { parseCacheEnvironment } from '#server/config/runtime-environment.js';

import { Redis, type RedisOptions } from 'ioredis';
import { Observable, Subject } from 'rxjs';

const CHANNEL_PREFIX = 'work-os:chat:user:';
const redisOptions = {
  connectTimeout: 1_000,
  enableOfflineQueue: false,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
} satisfies RedisOptions;

type LocalStream = {
  subject: Subject<ChatRealtimeEvent>;
  subscribers: number;
};

@Injectable()
export class RedisChatRealtimeAdapter
  extends ChatRealtimeProvider
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(RedisChatRealtimeAdapter.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly localStreams = new Map<string, LocalStream>();

  constructor() {
    super();
    const { REDIS_CACHE_URL } = parseCacheEnvironment();
    this.publisher = new Redis(REDIS_CACHE_URL, redisOptions);
    this.subscriber = new Redis(REDIS_CACHE_URL, redisOptions);
    this.subscriber.on('message', (channel, payload) => {
      this.onRedisMessage(channel, payload);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    for (const stream of this.localStreams.values()) {
      stream.subject.complete();
    }
    this.localStreams.clear();
    this.subscriber.removeAllListeners('message');
    await Promise.allSettled([
      closeRedisClient(this.publisher),
      closeRedisClient(this.subscriber),
    ]);
  }

  events(userId: string): Observable<ChatRealtimeEvent> {
    return new Observable((observer) => {
      let stream = this.localStreams.get(userId);
      if (!stream) {
        stream = {
          subject: new Subject<ChatRealtimeEvent>(),
          subscribers: 0,
        };
        this.localStreams.set(userId, stream);
        void this.subscribeUser(userId, stream);
      }

      stream.subscribers += 1;
      const subscription = stream.subject.subscribe(observer);

      return () => {
        subscription.unsubscribe();
        const current = this.localStreams.get(userId);
        if (!current) {
          return;
        }
        current.subscribers -= 1;
        if (current.subscribers > 0) {
          return;
        }

        this.localStreams.delete(userId);
        current.subject.complete();
        void this.unsubscribeUser(userId);
      };
    });
  }

  async publishConversationChanged(
    participantUserIds: readonly string[],
    conversationId: string,
  ): Promise<void> {
    await this.publish(participantUserIds, {
      eventId: randomUUID(),
      type: 'conversation.changed',
      conversationId,
      occurredAt: new Date().toISOString(),
    });
  }

  async publishMessageCreated(
    participantUserIds: readonly string[],
    message: ChatMessageResponse,
  ): Promise<void> {
    await this.publish(participantUserIds, {
      eventId: randomUUID(),
      type: 'message.created',
      conversationId: message.conversationId,
      message,
      occurredAt: new Date().toISOString(),
    });
  }

  async publishMessageUpdated(
    participantUserIds: readonly string[],
    message: ChatMessageResponse,
  ): Promise<void> {
    await this.publish(participantUserIds, {
      eventId: randomUUID(),
      type: 'message.updated',
      conversationId: message.conversationId,
      message,
      occurredAt: new Date().toISOString(),
    });
  }

  async publishConversationRead(
    participantUserIds: readonly string[],
    input: {
      conversationId: string;
      userId: string;
      readAt: string;
    },
  ): Promise<void> {
    await this.publish(participantUserIds, {
      eventId: randomUUID(),
      type: 'conversation.read',
      conversationId: input.conversationId,
      userId: input.userId,
      readAt: input.readAt,
      occurredAt: new Date().toISOString(),
    });
  }

  private async subscribeUser(
    userId: string,
    stream: LocalStream,
  ): Promise<void> {
    try {
      await connectRedisClient(this.subscriber);
      if (this.localStreams.get(userId) !== stream) {
        return;
      }
      await this.subscriber.subscribe(channelForUser(userId));
      if (this.localStreams.get(userId) !== stream) {
        await this.unsubscribeUser(userId);
      }
    } catch (error) {
      this.logger.warn('채팅 실시간 Redis 구독에 실패했습니다.', error);
      if (this.localStreams.get(userId) === stream) {
        this.localStreams.delete(userId);
        stream.subject.error(error);
      }
    }
  }

  private async unsubscribeUser(userId: string): Promise<void> {
    if (this.subscriber.status !== 'ready') {
      return;
    }
    try {
      await this.subscriber.unsubscribe(channelForUser(userId));
    } catch (error) {
      this.logger.warn('채팅 실시간 Redis 구독 해제에 실패했습니다.', error);
    }
  }

  private async publish(
    participantUserIds: readonly string[],
    event: ChatRealtimeEvent,
  ): Promise<void> {
    const parsedEvent = ChatRealtimeEventSchema.parse(event);
    const payload = JSON.stringify(parsedEvent);
    try {
      await connectRedisClient(this.publisher);
      await Promise.all(
        [...new Set(participantUserIds)].map((userId) =>
          this.publisher.publish(channelForUser(userId), payload),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `채팅 실시간 발행에 실패했습니다: ${parsedEvent.type}`,
        error,
      );
    }
  }

  private onRedisMessage(channel: string, payload: string): void {
    if (!channel.startsWith(CHANNEL_PREFIX)) {
      return;
    }

    const userId = channel.slice(CHANNEL_PREFIX.length);
    const stream = this.localStreams.get(userId);
    if (!stream) {
      return;
    }

    try {
      const event = ChatRealtimeEventSchema.parse(JSON.parse(payload));
      stream.subject.next(event);
    } catch (error) {
      this.logger.warn(
        '유효하지 않은 채팅 실시간 이벤트를 무시했습니다.',
        error,
      );
    }
  }
}

function channelForUser(userId: string): string {
  return `${CHANNEL_PREFIX}${userId}`;
}

async function connectRedisClient(client: Redis): Promise<void> {
  if (client.status === 'ready') {
    return;
  }
  if (client.status === 'wait' || client.status === 'end') {
    await client.connect();
  }
}

async function closeRedisClient(client: Redis): Promise<void> {
  if (client.status === 'end') {
    return;
  }
  if (client.status === 'ready') {
    await client.quit();
    return;
  }
  client.disconnect();
}
