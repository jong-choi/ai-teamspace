import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import {
  MCP_ACCESS_KEY_RECONCILIATION_JOB,
  MCP_ACCESS_KEY_RECONCILIATION_QUEUE,
  MCP_ACCESS_KEY_RECONCILIATION_SCHEDULER_ID,
} from '@/jobs/mcp-access-key-reconciliation.job';

import type { Queue } from 'bullmq';

@Injectable()
export class McpAccessKeyReconciliationScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(MCP_ACCESS_KEY_RECONCILIATION_QUEUE)
    private readonly queue: Queue,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  // 같은 scheduler id로 upsert하므로 worker가 여러 개이거나 재시작해도 주기마다 job은 하나만 생긴다.
  // 주기가 같으면 BullMQ가 기존 다음 실행 시각을 유지하고, 처음 등록할 때만 첫 job을 바로 만든다.
  async onApplicationBootstrap(): Promise<void> {
    const { reconciliationIntervalSeconds } = this.configService.getOrThrow(
      'mcp',
      { infer: true },
    ).accessKey;

    await this.queue.upsertJobScheduler(
      MCP_ACCESS_KEY_RECONCILIATION_SCHEDULER_ID,
      { every: reconciliationIntervalSeconds * 1_000 },
      { name: MCP_ACCESS_KEY_RECONCILIATION_JOB },
    );
  }
}
