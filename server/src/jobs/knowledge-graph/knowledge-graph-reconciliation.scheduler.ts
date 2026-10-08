import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import type { ReconciliationScope } from '@/knowledge-graph/domain/reconciliation-scope';
import { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import { KnowledgeGraphBackfillService } from '@/knowledge-graph/knowledge-graph-backfill.service';
import { KnowledgeGraphReconciliationService } from '@/knowledge-graph/knowledge-graph-reconciliation.service';

const TICK_INTERVAL_MS = 60_000;
const TICK_BUDGET_MS = 20_000;
const MAX_ROUNDS_PER_TICK = 20;
const REQUEUE_BATCH = 100;

type RecoveryTask = {
  name: 'pending_requeue' | ReconciliationScope['purpose'];
  run: () => Promise<number | null>;
};

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

@Injectable()
export class KnowledgeGraphReconciliationScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    KnowledgeGraphReconciliationScheduler.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<number> | null = null;
  private initialized = false;

  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly backfill: KnowledgeGraphBackfillService,
    private readonly reconciliation: KnowledgeGraphReconciliationService,
    private readonly state: ProjectionStateRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, TICK_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.inFlight;
  }

  runOnce(): Promise<number> {
    if (this.inFlight || !this.config.enabled) return Promise.resolve(0);
    const task = this.runTasks().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = task;
    return task;
  }
  private async runTasks(): Promise<number> {
    if (!this.initialized) {
      try {
        await this.reconciliation.initialize();
        this.initialized = true;
      } catch (error) {
        this.logger.error({
          event: 'knowledge_graph_reconciliation_initialize_failed',
          errorName: errorName(error),
        });
        return 0;
      }
    }
    const tasks: RecoveryTask[] = [
      {
        name: 'pending_requeue',
        run: async () =>
          (await this.backfill.requeueUnapplied(REQUEUE_BATCH)) || null,
      },
      {
        name: 'organizations',
        run: () => this.reconciliation.discoverOrganizations(),
      },
      {
        name: 'owner_sources',
        run: () => this.reconciliation.discoverOwnerSources(),
      },
      {
        name: 'membership_sources',
        run: () => this.reconciliation.observeMemberships(),
      },
      {
        name: 'organization_presence',
        run: () => this.reconciliation.observeOrganizationPresence(),
      },
    ];
    const results = await Promise.allSettled(
      tasks.map((task) => this.drain(task)),
    );
    let handled = 0;
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') handled += result.value;
      else
        this.logger.error({
          event: 'knowledge_graph_reconciliation_task_failed',
          task: tasks[index]?.name,
          errorName: errorName(result.reason),
        });
    }
    await this.logRecoveryStats();
    return handled;
  }
  private async drain(task: RecoveryTask): Promise<number> {
    const startedAt = Date.now();
    let total = 0;
    for (
      let round = 0;
      round < MAX_ROUNDS_PER_TICK && Date.now() - startedAt < TICK_BUDGET_MS;
      round += 1
    ) {
      const handled = await task.run();
      if (handled === null) break;
      total += handled;
    }
    return total;
  }
  private async logRecoveryStats(): Promise<void> {
    try {
      const [stats] = await this.state.recoveryStats();
      if (!stats) return;
      const { oldestPendingAt, ...counts } = stats;
      this.logger.log({
        event: 'knowledge_graph_recovery_stats',
        ...counts,
        oldestPendingAgeMs: oldestPendingAt
          ? Date.now() - oldestPendingAt.getTime()
          : null,
      });
    } catch (error) {
      this.logger.warn({
        event: 'knowledge_graph_recovery_stats_failed',
        errorName: errorName(error),
      });
    }
  }
}
