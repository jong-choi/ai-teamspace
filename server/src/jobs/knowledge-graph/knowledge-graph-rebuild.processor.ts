import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';

import {
  KNOWLEDGE_GRAPH_REBUILD_JOB,
  KNOWLEDGE_GRAPH_REBUILD_QUEUE,
  KnowledgeGraphRebuildJobDataSchema,
} from '@/jobs/knowledge-graph/knowledge-graph-rebuild.job';
import { GraphRebuildWorkflowService } from '@/knowledge-graph/graph-rebuild-workflow.service';

import { DelayedError, type Job, UnrecoverableError } from 'bullmq';

@Injectable()
@Processor(KNOWLEDGE_GRAPH_REBUILD_QUEUE)
export class KnowledgeGraphRebuildProcessor extends WorkerHost {
  constructor(private readonly workflow: GraphRebuildWorkflowService) {
    super();
  }

  async process(
    job: Pick<Job, 'name' | 'data' | 'moveToDelayed'>,
    token?: string,
  ): Promise<void> {
    if (job.name !== KNOWLEDGE_GRAPH_REBUILD_JOB)
      throw new UnrecoverableError('KG_REBUILD_JOB_INVALID');

    const parsed = KnowledgeGraphRebuildJobDataSchema.safeParse(job.data);
    if (!parsed.success)
      throw new UnrecoverableError('KG_REBUILD_JOB_PAYLOAD_INVALID');

    const result = await this.workflow.run(parsed.data.requestId);
    if (result.kind === 'done') return;
    if (!token) throw new Error('KG_REBUILD_JOB_TOKEN_MISSING');

    const delayMs = result.kind === 'busy' ? 15_000 : result.delayMs;
    await job.moveToDelayed(Date.now() + delayMs, token);
    throw new DelayedError();
  }
}
