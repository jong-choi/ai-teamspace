import { McpAccessMaintenanceService } from '@/mcp-access/maintenance/mcp-access-maintenance.service';
import { McpAccessService } from '@/mcp-access/mcp-access.service';

describe('McpAccessMaintenanceService', () => {
  it('bounded batch와 cursor resume를 deterministic하게 수행한다', async () => {
    const ensureOrganizationPolicy = jest.fn().mockResolvedValue({});
    const reconcileUserPolicyMembership = jest
      .fn()
      .mockResolvedValueOnce('ensured')
      .mockResolvedValueOnce('deleted');
    const service = new McpAccessMaintenanceService({
      ensureOrganizationPolicy,
      reconcileUserPolicyMembership,
    } as unknown as McpAccessService);

    const targets = [
      {
        organizationId: 'org-a',
        userIds: ['user-a', 'user-b'],
      },
    ];

    await expect(
      service.runBatch({ targets, cursor: 0, limit: 2 }),
    ).resolves.toEqual({
      cursor: 0,
      nextCursor: 2,
      processedTasks: 2,
      totalTasks: 3,
      ensuredOrganizations: 1,
      ensuredUsers: 1,
      deletedStaleUsers: 0,
    });

    await expect(
      service.runBatch({ targets, cursor: 2, limit: 2 }),
    ).resolves.toEqual({
      cursor: 2,
      nextCursor: null,
      processedTasks: 1,
      totalTasks: 3,
      ensuredOrganizations: 0,
      ensuredUsers: 0,
      deletedStaleUsers: 1,
    });
  });

  it('duplicate organization/user target을 한 batch task로 dedupe한다', async () => {
    const ensureOrganizationPolicy = jest.fn().mockResolvedValue({});
    const reconcileUserPolicyMembership = jest
      .fn()
      .mockResolvedValue('ensured');
    const service = new McpAccessMaintenanceService({
      ensureOrganizationPolicy,
      reconcileUserPolicyMembership,
    } as unknown as McpAccessService);

    const result = await service.runBatch({
      targets: [
        { organizationId: 'org-a', userIds: ['user-a', 'user-a'] },
        { organizationId: 'org-a', userIds: ['user-a'] },
      ],
    });

    expect(result.totalTasks).toBe(2);
    expect(ensureOrganizationPolicy).toHaveBeenCalledTimes(1);
    expect(reconcileUserPolicyMembership).toHaveBeenCalledTimes(1);
  });

  it('limit은 최대 100 task로 제한한다', async () => {
    const ensureOrganizationPolicy = jest.fn().mockResolvedValue({});
    const reconcileUserPolicyMembership = jest
      .fn()
      .mockResolvedValue('ensured');
    const service = new McpAccessMaintenanceService({
      ensureOrganizationPolicy,
      reconcileUserPolicyMembership,
    } as unknown as McpAccessService);

    const result = await service.runBatch({
      targets: [
        {
          organizationId: 'org-a',
          userIds: Array.from({ length: 120 }, (_, index) => 'user-' + index),
        },
      ],
      limit: 500,
    });

    expect(result.processedTasks).toBe(100);
    expect(result.nextCursor).toBe(100);
  });
});
