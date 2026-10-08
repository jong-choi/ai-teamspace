import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type { McpAccessKeyRecord } from '@/mcp-access-keys/domain/mcp-access-key';
import type { McpAccessKeyProvider } from '@/mcp-access-keys/infrastructure/access-key/mcp-access-key.provider';
import type { McpAccessKeyCoordinationRepository } from '@/mcp-access-keys/infrastructure/persistence/mcp-access-key-coordination.repository';
import { McpAccessKeyReconciliationService } from '@/mcp-access-keys/mcp-access-key-reconciliation.service';

const config = {
  accessKey: {
    maxActivePerUser: 2,
    reservationStaleAfterSeconds: 300,
    reconciliationBatchSize: 2,
  },
};

const activeKey: McpAccessKeyRecord = {
  id: 'key-a',
  name: '노트북',
  prefix: 'wos_mcp_',
  start: 'wos_mc',
  enabled: true,
  expired: false,
  scopes: ['wiki:read'],
  organizationGrant: { mode: 'all-user-organizations' },
  lastUsedAt: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
};

describe('MCP access key reconciliation', () => {
  const listForUser = jest.fn();
  const getForUser = jest.fn();
  const revoke = jest.fn();
  const listCoordinatedUserIds = jest.fn();
  const listAllocationsForUser = jest.fn();
  const findAllocationByKeyId = jest.fn();
  const reserveAllocation = jest.fn();
  const finalizeAllocation = jest.fn();
  const releaseAllocation = jest.fn();
  const listExpiredOperationsForUser = jest.fn();
  const completeOperation = jest.fn();
  const failOperation = jest.fn();

  const service = new McpAccessKeyReconciliationService(
    { getOrThrow: () => config } as unknown as ConfigService<AllConfigType>,
    {
      listForUser,
      getForUser,
      revoke,
    } as unknown as McpAccessKeyProvider,
    {
      listCoordinatedUserIds,
      listAllocationsForUser,
      findAllocationByKeyId,
      reserveAllocation,
      finalizeAllocation,
      releaseAllocation,
      listExpiredOperationsForUser,
      completeOperation,
      failOperation,
    } as unknown as McpAccessKeyCoordinationRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    listForUser.mockResolvedValue([]);
    listAllocationsForUser.mockResolvedValue([]);
    listExpiredOperationsForUser.mockResolvedValue([]);
    findAllocationByKeyId.mockResolvedValue(null);
    revoke.mockResolvedValue(true);
  });

  it('전체 정리는 userId page를 끝까지 이어 받고 user마다 한 번씩 정리한다', async () => {
    listCoordinatedUserIds
      .mockResolvedValueOnce(['user-a', 'user-b'])
      .mockResolvedValueOnce(['user-c']);

    const sweep = await service.reconcileAllUsers();

    expect(listCoordinatedUserIds.mock.calls).toEqual([
      [{ afterUserId: null, limit: 2 }],
      [{ afterUserId: 'user-b', limit: 2 }],
    ]);
    expect(listForUser.mock.calls).toEqual([
      ['user-a'],
      ['user-b'],
      ['user-c'],
    ]);
    expect(sweep).toMatchObject({ reconciledUsers: 3, failedUsers: 0 });
  });

  it('page가 정확히 가득 차면 빈 page를 받은 뒤 끝낸다', async () => {
    listCoordinatedUserIds
      .mockResolvedValueOnce(['user-a', 'user-b'])
      .mockResolvedValueOnce([]);

    const sweep = await service.reconcileAllUsers();

    expect(listCoordinatedUserIds).toHaveBeenCalledTimes(2);
    expect(sweep.reconciledUsers).toBe(2);
  });

  it('한 user 정리가 실패해도 나머지 user를 정리하고 log에 user id를 남기지 않는다', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    listCoordinatedUserIds
      .mockResolvedValueOnce(['user-a', 'user-b'])
      .mockResolvedValueOnce(['user-c']);
    listForUser.mockImplementation(async (userId: string) => {
      if (userId === 'user-b') throw new TypeError('provider 장애');
      return [];
    });

    const sweep = await service.reconcileAllUsers();

    expect(sweep).toMatchObject({ reconciledUsers: 2, failedUsers: 1 });
    expect(listForUser).toHaveBeenCalledWith('user-c');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('user-b');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorName: 'TypeError' }),
    );
    warn.mockRestore();
  });

  it('stale reservation을 해제하고 allocation 없는 active key를 복구한다', async () => {
    const stale = new Date(Date.now() - 301_000);
    listForUser.mockResolvedValue([activeKey]);
    listAllocationsForUser.mockResolvedValue([
      {
        id: 'allocation-stale',
        userId: 'user-a',
        slot: 0,
        betterAuthKeyId: null,
        state: 'reserving',
        createdAt: stale,
        updatedAt: stale,
      },
    ]);
    reserveAllocation.mockResolvedValue({
      id: 'allocation-new',
      userId: 'user-a',
      slot: 0,
      betterAuthKeyId: null,
      state: 'reserving',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    finalizeAllocation.mockResolvedValue({
      id: 'allocation-new',
      userId: 'user-a',
      slot: 0,
      betterAuthKeyId: 'key-a',
      state: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.reconcileUser('user-a');

    expect(releaseAllocation).toHaveBeenCalledWith('allocation-stale');
    expect(reserveAllocation).toHaveBeenCalledWith('user-a', 2);
    expect(finalizeAllocation).toHaveBeenCalledWith('allocation-new', 'key-a');
    expect(result).toMatchObject({
      releasedAllocations: 1,
      recoveredAllocations: 1,
      revokedOrphanKeys: 0,
    });
  });

  it('orphan active key가 quota slot을 얻지 못하면 revoke한다', async () => {
    listForUser.mockResolvedValue([activeKey]);
    reserveAllocation.mockResolvedValue(null);

    const result = await service.reconcileUser('user-a');

    expect(revoke).toHaveBeenCalledWith('user-a', 'key-a');
    expect(result.revokedOrphanKeys).toBe(1);
  });

  it('expired pending operation은 실제 key/allocation 상태에 따라 complete 또는 fail한다', async () => {
    listForUser.mockResolvedValue([activeKey]);
    findAllocationByKeyId.mockResolvedValue({
      id: 'allocation-a',
      userId: 'user-a',
      slot: 0,
      betterAuthKeyId: 'key-a',
      state: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    getForUser.mockResolvedValueOnce(activeKey).mockResolvedValueOnce(null);
    listExpiredOperationsForUser.mockResolvedValue([
      {
        id: 'operation-complete',
        userId: 'user-a',
        idempotencyKey: 'idem-a',
        operation: 'create',
        requestFingerprint: 'a'.repeat(64),
        status: 'pending',
        resultingKeyId: 'key-a',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(),
      },
      {
        id: 'operation-fail',
        userId: 'user-a',
        idempotencyKey: 'idem-b',
        operation: 'create',
        requestFingerprint: 'b'.repeat(64),
        status: 'pending',
        resultingKeyId: 'key-missing',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(),
      },
    ]);
    completeOperation.mockResolvedValue({
      id: 'operation-complete',
    });

    const result = await service.reconcileUser('user-a');

    expect(completeOperation).toHaveBeenCalledWith(
      'operation-complete',
      'key-a',
    );
    expect(failOperation).toHaveBeenCalledWith('operation-fail');
    expect(result.completedOperations).toBe(1);
    expect(result.failedOperations).toBe(1);
  });
});
