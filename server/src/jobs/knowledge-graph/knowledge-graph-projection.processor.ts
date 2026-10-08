import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import {
  KNOWLEDGE_GRAPH_PROJECTION_QUEUE,
  KNOWLEDGE_GRAPH_SOURCE_CHANGED_JOB,
} from '@/jobs/knowledge-graph/knowledge-graph-projection.job';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphProjectionService } from '@/knowledge-graph/knowledge-graph-projection.service';

import type { Job } from 'bullmq';

@Injectable()
@Processor(KNOWLEDGE_GRAPH_PROJECTION_QUEUE)
export class KnowledgeGraphProjectionProcessor extends WorkerHost {
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly projection: KnowledgeGraphProjectionService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (!this.config.enabled) {
      throw new Error(
        '비활성화된 지식 그래프 큐에서 작업을 처리할 수 없습니다.',
      );
    }
    if (job.name !== KNOWLEDGE_GRAPH_SOURCE_CHANGED_JOB) {
      throw new Error('알 수 없는 지식 그래프 작업 종류입니다.');
    }
    try {
      await this.projection.applySourceEvent(job.data);
    } catch (error) {
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade + 1 >= attempts) {
        await this.projection.markTerminalFailure(job.data);
      }
      throw error;
    }
  }
}
