import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import {
  NonRetryableMessageError,
  type OutboxMessage,
  OutboxTransport,
} from '@nestjs/outbox';

import {
  KNOWLEDGE_GRAPH_REBUILD_JOB,
  knowledgeGraphRebuildJobId,
} from '@/jobs/knowledge-graph/knowledge-graph-rebuild.job';
import { awaitOutboxPublish } from '@/jobs/knowledge-graph/outbox-publish';
import {
  GraphRebuildRequestedEventSchema,
  KNOWLEDGE_GRAPH_REBUILD_REQUESTED_TOPIC,
} from '@/outbox/outbox-graph-rebuild-event.schema';

import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

@Injectable()
export class KnowledgeGraphRebuildOutboxTransport
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
    if (signal.aborted) throw new Error('KG_REBUILD_PUBLISH_ABORTED');
    if (message.topic !== KNOWLEDGE_GRAPH_REBUILD_REQUESTED_TOPIC)
      throw new NonRetryableMessageError('KG_REBUILD_TOPIC_INVALID');

    const parsed = GraphRebuildRequestedEventSchema.safeParse(message.payload);
    if (!parsed.success)
      throw new NonRetryableMessageError('KG_REBUILD_PAYLOAD_INVALID');
    if (
      message.key !==
      JSON.stringify(['graph_rebuild', parsed.data.organizationId])
    )
      throw new NonRetryableMessageError('KG_REBUILD_KEY_INVALID');
    if (this.connection.status !== 'ready')
      throw new Error('KG_REBUILD_QUEUE_NOT_READY');

    await awaitOutboxPublish(
      this.queue.add(
        KNOWLEDGE_GRAPH_REBUILD_JOB,
        { requestId: parsed.data.requestId },
        {
          jobId: knowledgeGraphRebuildJobId(parsed.data.requestId),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: { age: 86_400, count: 1_000 },
        },
      ),
      signal,
      'KG_REBUILD_OUTBOX',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.queue.close();
    } finally {
      this.connection.disconnect();
    }
  }
}
