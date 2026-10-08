import type { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import {
  MCP_ACCESS_KEY_RECONCILIATION_JOB,
  MCP_ACCESS_KEY_RECONCILIATION_SCHEDULER_ID,
} from '@/jobs/mcp-access-key-reconciliation.job';
import { McpAccessKeyReconciliationScheduler } from '@/jobs/mcp-access-key-reconciliation.scheduler';

import type { Queue } from 'bullmq';

describe('McpAccessKeyReconciliationScheduler', () => {
  it('설정한 주기로 고정 id의 job scheduler를 upsert한다', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    const scheduler = new McpAccessKeyReconciliationScheduler(
      { upsertJobScheduler } as unknown as Queue,
      {
        getOrThrow: () => ({
          accessKey: { reconciliationIntervalSeconds: 900 },
        }),
      } as unknown as ConfigService<AllConfigType>,
    );

    await scheduler.onApplicationBootstrap();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      MCP_ACCESS_KEY_RECONCILIATION_SCHEDULER_ID,
      { every: 900_000 },
      { name: MCP_ACCESS_KEY_RECONCILIATION_JOB },
    );
  });
});
