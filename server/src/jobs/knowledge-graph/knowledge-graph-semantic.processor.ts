import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import {
  KNOWLEDGE_GRAPH_SEMANTIC_QUEUE,
  SEMANTIC_AUTO_JOB,
  SEMANTIC_MANUAL_JOB,
  SEMANTIC_REMOVE_JOB,
  SemanticJobDataSchema,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import {
  SemanticLeaseLostError,
  SemanticProviderError,
} from '@/knowledge-graph/domain/semantic-error';
import { SemanticIngestionService } from '@/knowledge-graph/semantic-ingestion.service';

import { DelayedError, type Job, UnrecoverableError, Worker } from 'bullmq';

@Injectable()
@Processor(KNOWLEDGE_GRAPH_SEMANTIC_QUEUE, { autorun: false })
export class KnowledgeGraphSemanticProcessor
  extends WorkerHost
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(KnowledgeGraphSemanticProcessor.name);
  private readonly shutdown = new AbortController();
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly ingestion: SemanticIngestionService,
  ) {
    super();
  }
  onApplicationBootstrap() {
    if (!this.config.semanticEnabled) return;
    this.worker.concurrency = this.config.semanticWorkerConcurrency;
    this.worker.opts.limiter = {
      max: this.config.semanticProviderMaxPerMinute,
      duration: 60_000,
    };
    void this.worker
      .run()
      .catch(() => this.logger.error({ code: 'SEMANTIC_WORKER_START_FAILED' }));
  }
  onModuleDestroy() {
    this.shutdown.abort();
  }
  async process(
    job: Pick<Job, 'name' | 'data' | 'opts' | 'attemptsMade' | 'moveToDelayed'>,
    token?: string,
  ) {
    if (!this.config.semanticEnabled)
      throw new UnrecoverableError('SEMANTIC_DISABLED');
    if (
      ![SEMANTIC_AUTO_JOB, SEMANTIC_MANUAL_JOB, SEMANTIC_REMOVE_JOB].includes(
        job.name,
      )
    )
      throw new UnrecoverableError('SEMANTIC_JOB_INVALID');
    const parsed = SemanticJobDataSchema.safeParse(job.data);
    if (!parsed.success)
      throw new UnrecoverableError('SEMANTIC_PAYLOAD_INVALID');
    try {
      const result = await this.ingestion.run(
        parsed.data,
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        this.shutdown.signal,
      );
      if (result === 'busy') {
        if (!token) throw new Error('SEMANTIC_JOB_TOKEN_MISSING');
        await job.moveToDelayed(Date.now() + 15_000, token);
        throw new DelayedError();
      }
    } catch (error) {
      if (error instanceof DelayedError) throw error;
      if (
        error instanceof SemanticLeaseLostError ||
        this.shutdown.signal.aborted
      )
        return;
      if (error instanceof SemanticProviderError) {
        if (error.terminal || !error.retryable)
          throw new UnrecoverableError(error.code);
        if (error.code === 'PROVIDER_RATE_LIMITED') {
          await this.worker.rateLimit(error.retryAfterMs ?? 60_000);
          throw Worker.RateLimitError();
        }
        throw new Error(error.code);
      }
      throw new Error('SEMANTIC_INTERNAL');
    }
  }
}
