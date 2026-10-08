import { Logger } from '@nestjs/common';

import { MCP_ACCESS_KEY_RECONCILIATION_JOB } from '@/jobs/mcp-access-key-reconciliation.job';
import { McpAccessKeyReconciliationProcessor } from '@/jobs/mcp-access-key-reconciliation.processor';
import type { McpAccessKeyReconciliationService } from '@/mcp-access-keys/mcp-access-key-reconciliation.service';

import type { Job } from 'bullmq';

describe('McpAccessKeyReconciliationProcessor', () => {
  const reconcileAllUsers = jest.fn();
  const processor = new McpAccessKeyReconciliationProcessor({
    reconcileAllUsers,
  } as unknown as McpAccessKeyReconciliationService);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('반복 job마다 전체 user 정리를 실행하고 집계를 job 결과로 남긴다', async () => {
    const sweep = {
      releasedAllocations: 1,
      recoveredAllocations: 0,
      revokedOrphanKeys: 0,
      completedOperations: 0,
      failedOperations: 0,
      reconciledUsers: 3,
      failedUsers: 0,
    };
    reconcileAllUsers.mockResolvedValue(sweep);

    await expect(
      processor.process({ name: MCP_ACCESS_KEY_RECONCILIATION_JOB } as Job),
    ).resolves.toEqual(sweep);
    expect(reconcileAllUsers).toHaveBeenCalledTimes(1);
  });

  it('알 수 없는 job은 정리를 실행하지 않고 실패한다', async () => {
    await expect(
      processor.process({ name: 'unknown-job' } as Job),
    ).rejects.toThrow('지원하지 않는 MCP access key reconciliation job');
    expect(reconcileAllUsers).not.toHaveBeenCalled();
  });
});
