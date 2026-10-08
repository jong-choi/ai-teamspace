import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';

import {
  MCP_ACCESS_KEY_RECONCILIATION_JOB,
  MCP_ACCESS_KEY_RECONCILIATION_QUEUE,
} from '@/jobs/mcp-access-key-reconciliation.job';
import {
  McpAccessKeyReconciliationService,
  type McpAccessKeyReconciliationSweepResult,
} from '@/mcp-access-keys/mcp-access-key-reconciliation.service';

import type { Job } from 'bullmq';

@Injectable()
@Processor(MCP_ACCESS_KEY_RECONCILIATION_QUEUE)
export class McpAccessKeyReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(
    McpAccessKeyReconciliationProcessor.name,
  );

  constructor(
    private readonly reconciliation: McpAccessKeyReconciliationService,
  ) {
    super();
  }

  async process(job: Job): Promise<McpAccessKeyReconciliationSweepResult> {
    if (job.name !== MCP_ACCESS_KEY_RECONCILIATION_JOB) {
      throw new Error(
        '지원하지 않는 MCP access key reconciliation job입니다: ' + job.name,
      );
    }

    const sweep = await this.reconciliation.reconcileAllUsers();
    this.logger.log({
      event: 'mcp_access_key_reconciliation_completed',
      ...sweep,
    });
    return sweep;
  }
}
