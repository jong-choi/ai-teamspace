import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphBackfillService } from '@/knowledge-graph/knowledge-graph-backfill.service';

const RECONCILIATION_INTERVAL_MS = 60_000;
const RECONCILIATION_BATCH_SIZE = 100;

@Injectable()
export class KnowledgeGraphReconciliationScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    KnowledgeGraphReconciliationScheduler.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly backfill: KnowledgeGraphBackfillService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, RECONCILIATION_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<number> {
    if (this.running || !this.config.enabled) return 0;
    this.running = true;
    try {
      return await this.backfill.requeueUnapplied(RECONCILIATION_BATCH_SIZE);
    } catch {
      this.logger.error('지식 그래프 reconciliation 실행에 실패했습니다.');
      return 0;
    } finally {
      this.running = false;
    }
  }
}
