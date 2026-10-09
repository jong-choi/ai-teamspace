import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import {
  KNOWLEDGE_GRAPH_REBUILD_JOB,
  KNOWLEDGE_GRAPH_REBUILD_QUEUE,
  knowledgeGraphRebuildJobId,
} from '@/jobs/knowledge-graph/knowledge-graph-rebuild.job';
import { GraphRebuildWorkerRepository } from '@/knowledge-graph/infrastructure/persistence/graph-rebuild-request.repository';

import type { Queue } from 'bullmq';

const TICK_INTERVAL_MS = 60_000;
const REDELIVERY_LIMIT = 10;

@Injectable()
export class KnowledgeGraphRebuildReconciliationScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    KnowledgeGraphRebuildReconciliationScheduler.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<number> | null = null;

  constructor(
    private readonly repository: GraphRebuildWorkerRepository,
    @InjectQueue(KNOWLEDGE_GRAPH_REBUILD_QUEUE)
    private readonly queue: Queue,
  ) {}

  onApplicationBootstrap(): void {
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), TICK_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight;
  }

  runOnce(): Promise<number> {
    if (this.inFlight) return Promise.resolve(0);
    this.inFlight = this.redeliver()
      .catch(() => {
        this.logger.warn({ code: 'KG_REBUILD_RECONCILIATION_FAILED' });
        return 0;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async redeliver(): Promise<number> {
    const requestIds =
      await this.repository.listRedeliverable(REDELIVERY_LIMIT);
    for (const requestId of requestIds) {
      await this.queue.add(
        KNOWLEDGE_GRAPH_REBUILD_JOB,
        { requestId },
        {
          jobId: knowledgeGraphRebuildJobId(requestId),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: { age: 86_400, count: 1_000 },
        },
      );
    }
    return requestIds.length;
  }
}
