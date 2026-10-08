import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import {
  NonRetryableMessageError,
  type OutboxMessage,
  OutboxTransport,
} from '@nestjs/outbox';

import { KNOWLEDGE_GRAPH_SOURCE_CHANGED_JOB } from '@/jobs/knowledge-graph/knowledge-graph-projection.job';
import { KNOWLEDGE_GRAPH_OUTBOX_TOPIC } from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateEventSchema } from '@/outbox/outbox-aggregate-event.schema';
import {
  KNOWLEDGE_GRAPH_JOB_ATTEMPTS,
  KNOWLEDGE_GRAPH_JOB_BACKOFF_MS,
} from '@/outbox/outbox-aggregate-recovery.policy';

import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

@Injectable()
export class KnowledgeGraphOutboxTransport
  extends OutboxTransport
  implements OnApplicationShutdown
{
  constructor(
    private readonly queue: Pick<Queue, 'add' | 'close'>,
    private readonly connection: Pick<Redis, 'status' | 'disconnect'>,
  ) {
    super();
  }

  async publish(
    message: OutboxMessage,
    { signal }: Parameters<OutboxTransport['publish']>[1],
  ): Promise<void> {
    if (signal.aborted)
      throw new Error('KNOWLEDGE_GRAPH_OUTBOX_PUBLISH_ABORTED');
    if (message.topic !== KNOWLEDGE_GRAPH_OUTBOX_TOPIC) {
      throw new NonRetryableMessageError(
        'KNOWLEDGE_GRAPH_OUTBOX_TOPIC_INVALID',
      );
    }
    const payload = OutboxAggregateEventSchema.safeParse(message.payload);
    if (!payload.success) {
      throw new NonRetryableMessageError(
        'KNOWLEDGE_GRAPH_OUTBOX_PAYLOAD_INVALID',
      );
    }
    if (
      message.key !==
      JSON.stringify([
        payload.data.aggregateKind,
        payload.data.organizationId,
        payload.data.aggregateId,
      ])
    ) {
      throw new NonRetryableMessageError('KNOWLEDGE_GRAPH_OUTBOX_KEY_INVALID');
    }
    if (this.connection.status !== 'ready') {
      throw new Error('KNOWLEDGE_GRAPH_OUTBOX_QUEUE_NOT_READY');
    }

    // BullMQ의 add는 취소할 수 없다. 지연 성공도 같은 jobId로 중복 전달되며 source fence가 최종 중복을 차단한다.
    const publish = this.queue.add(
      KNOWLEDGE_GRAPH_SOURCE_CHANGED_JOB,
      payload.data,
      {
        jobId: message.id,
        attempts: KNOWLEDGE_GRAPH_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: KNOWLEDGE_GRAPH_JOB_BACKOFF_MS },
      },
    );
    let onAbort: () => void = () => {};
    try {
      await Promise.race([
        publish,
        new Promise<never>((_, reject) => {
          onAbort = () =>
            reject(new Error('KNOWLEDGE_GRAPH_OUTBOX_PUBLISH_ABORTED'));
          signal.addEventListener('abort', onAbort, { once: true });
          if (signal.aborted) onAbort();
        }),
      ]);
    } catch {
      // broker 주소·credential 등이 Outbox 오류 history에 노출되지 않게 고정 오류만 전달한다.
      if (signal.aborted)
        throw new Error('KNOWLEDGE_GRAPH_OUTBOX_PUBLISH_ABORTED');
      throw new Error('KNOWLEDGE_GRAPH_OUTBOX_PUBLISH_FAILED');
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.connection.disconnect();
    await this.queue.close();
  }
}
