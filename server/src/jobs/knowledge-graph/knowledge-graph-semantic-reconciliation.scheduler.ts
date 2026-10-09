import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { SemanticReconciliationService } from '@/knowledge-graph/semantic-reconciliation.service';

@Injectable()
export class KnowledgeGraphSemanticReconciliationScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    KnowledgeGraphSemanticReconciliationScheduler.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<number> | null = null;
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly service: SemanticReconciliationService,
  ) {}
  onApplicationBootstrap() {
    if (!this.config.semanticEnabled) return;
    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, 20_000);
    this.timer.unref();
  }
  runOnce(): Promise<number> {
    if (!this.config.semanticEnabled || this.inFlight)
      return Promise.resolve(0);
    this.inFlight = this.service
      .runOnce()
      .catch(() => {
        this.logger.warn({ code: 'SEMANTIC_RECONCILIATION_FAILED' });
        return 0;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight;
  }
}
