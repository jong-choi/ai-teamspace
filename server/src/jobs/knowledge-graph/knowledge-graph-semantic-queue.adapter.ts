import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';

import {
  SEMANTIC_AUTO_JOB,
  SEMANTIC_JOB_OPTIONS,
  SEMANTIC_MANUAL_JOB,
  SEMANTIC_REMOVE_JOB,
  semanticAutoDedupId,
  semanticRemoveJobId,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import {
  type createSemanticProducerResources,
  SEMANTIC_PRODUCER_RESOURCES,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic-queue.resources';
import { awaitOutboxPublish } from '@/jobs/knowledge-graph/outbox-publish';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

import type { JobsOptions } from 'bullmq';

@Injectable()
export class KnowledgeGraphSemanticQueueAdapter
  extends SemanticJobQueueProvider
  implements OnApplicationShutdown
{
  constructor(
    @Inject(SEMANTIC_PRODUCER_RESOURCES)
    private readonly resources: ReturnType<
      typeof createSemanticProducerResources
    >,
  ) {
    super();
  }
  auto(scope: SemanticSourceScope, delayMs: number, signal?: AbortSignal) {
    return this.enqueue(
      SEMANTIC_AUTO_JOB,
      scope,
      {
        delay: Math.max(0, delayMs),
        deduplication: {
          id: semanticAutoDedupId(scope),
          replace: true,
          keepLastIfActive: true,
        },
      },
      signal,
    );
  }
  manual(scope: SemanticSourceScope, requestId: string, signal?: AbortSignal) {
    return this.enqueue(
      SEMANTIC_MANUAL_JOB,
      scope,
      { delay: 0, jobId: `kg-semantic-manual-${requestId}` },
      signal,
    );
  }
  remove(scope: SemanticSourceScope, desiredSeq: number, signal?: AbortSignal) {
    return this.enqueue(
      SEMANTIC_REMOVE_JOB,
      scope,
      { delay: 0, jobId: semanticRemoveJobId(scope, desiredSeq) },
      signal,
    );
  }
  private async enqueue(
    name: string,
    scope: SemanticSourceScope,
    options: JobsOptions,
    signal = new AbortController().signal,
  ) {
    if (signal.aborted)
      throw new Error('KNOWLEDGE_GRAPH_SEMANTIC_PUBLISH_ABORTED');
    if (!this.resources || this.resources.connection.status !== 'ready')
      throw new Error('KNOWLEDGE_GRAPH_SEMANTIC_QUEUE_NOT_READY');
    const queue = this.resources.queue;
    const publish = (async () => {
      if (options.jobId) {
        const previous = await queue.getJob(options.jobId);
        if (previous) {
          const status = await previous.getState();
          if (status === 'completed' || status === 'failed')
            await previous.remove();
        }
      }
      if (signal.aborted)
        throw new Error('KNOWLEDGE_GRAPH_SEMANTIC_PUBLISH_ABORTED');
      return queue.add(name, scope, { ...SEMANTIC_JOB_OPTIONS, ...options });
    })();
    await awaitOutboxPublish(publish, signal, 'KNOWLEDGE_GRAPH_SEMANTIC');
  }
  async onApplicationShutdown() {
    if (!this.resources) return;
    try {
      await this.resources.queue.close();
    } finally {
      this.resources.connection.disconnect();
    }
  }
}
