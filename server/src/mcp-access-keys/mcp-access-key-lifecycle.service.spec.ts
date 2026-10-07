import type { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type { McpAccessKeyRecord } from '@/mcp-access-keys/domain/mcp-access-key';
import type { McpAccessKeyProvider } from '@/mcp-access-keys/infrastructure/access-key/mcp-access-key.provider';
import type { McpAccessKeyCoordinationRepository } from '@/mcp-access-keys/infrastructure/persistence/mcp-access-key-coordination.repository';
import {
  McpAccessKeyGrantInvalidError,
  McpAccessKeyQuotaExceededError,
} from '@/mcp-access-keys/mcp-access-key.error';
import { McpAccessKeyLifecycleService } from '@/mcp-access-keys/mcp-access-key-lifecycle.service';
import type { OrganizationMembershipService } from '@/organizations/organization-membership.service';

const config = {
  accessKey: {
    defaultExpiresInDays: 30,
    maxExpiresInDays: 365,
    maxActivePerUser: 2,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 60,
    operationRetentionHours: 24,
  },
};

const baseRecord: McpAccessKeyRecord = {
  id: 'key-a',
  name: '노트북',
  prefix: 'wos_mcp_',
  start: 'wos_mc',
  enabled: true,
  expired: false,
  scopes: ['organizations:read', 'wiki:read'],
  organizationGrant: {
    mode: 'selected',
    organizationIds: ['org-a'],
  },
  lastUsedAt: null,
  expiresAt: '2099-11-06T00:00:00.000Z',
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
};

const operation = {
  id: 'operation-a',
  userId: 'user-a',
  idempotencyKey: 'idem-a',
  operation: 'create' as const,
  requestFingerprint: 'a'.repeat(64),
  status: 'pending' as const,
  resultingKeyId: null,
  createdAt: new Date('2026-10-07T00:00:00.000Z'),
  updatedAt: new Date('2026-10-07T00:00:00.000Z'),
  expiresAt: new Date('2026-10-08T00:00:00.000Z'),
};

const allocation = {
  id: 'allocation-a',
  userId: 'user-a',
  slot: 0,
  betterAuthKeyId: null,
  state: 'reserving' as const,
  createdAt: new Date('2026-10-07T00:00:00.000Z'),
  updatedAt: new Date('2026-10-07T00:00:00.000Z'),
};

describe('MCP access key lifecycle', () => {
  const createForUser = jest.fn();
  const listForUser = jest.fn();
  const getForUser = jest.fn();
  const updateForUser = jest.fn();
  const revoke = jest.fn();
  const reserveAllocation = jest.fn();
  const finalizeAllocation = jest.fn();
  const releaseAllocation = jest.fn();
  const releaseAllocationByKeyId = jest.fn();
  const replaceAllocationKey = jest.fn();
  const reserveOperation = jest.fn();
  const listExpiredOperationsForUser = jest.fn();
  const recordOperationResult = jest.fn();
  const completeOperation = jest.fn();
  const failOperation = jest.fn();
  const hasMemberUser = jest.fn();

  const service = new McpAccessKeyLifecycleService(
    { getOrThrow: () => config } as unknown as ConfigService<AllConfigType>,
    {
      createForUser,
      listForUser,
      getForUser,
      updateForUser,
      revoke,
    } as unknown as McpAccessKeyProvider,
    {
      reserveAllocation,
      finalizeAllocation,
      releaseAllocation,
      releaseAllocationByKeyId,
      replaceAllocationKey,
      reserveOperation,
      listExpiredOperationsForUser,
      recordOperationResult,
      completeOperation,
      failOperation,
    } as unknown as McpAccessKeyCoordinationRepository,
    { hasMemberUser } as unknown as OrganizationMembershipService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    hasMemberUser.mockResolvedValue(true);
    reserveOperation.mockResolvedValue({
      status: 'reserved',
      operation,
    });
    reserveAllocation.mockResolvedValue(allocation);
    finalizeAllocation.mockResolvedValue({
      ...allocation,
      state: 'active',
      betterAuthKeyId: 'key-a',
    });
    recordOperationResult.mockResolvedValue({
      ...operation,
      resultingKeyId: 'key-a',
    });
    completeOperation.mockResolvedValue({
      ...operation,
      status: 'completed',
      resultingKeyId: 'key-a',
    });
    createForUser.mockResolvedValue({
      ...baseRecord,
      secret: 'wos_mcp_one-time-secret',
    });
    revoke.mockResolvedValue(true);
  });

  it('membership → idempotency → quota → provider → finalize 순서로 create한다', async () => {
    const result = await service.create(
      'user-a',
      {
        name: '노트북',
        scopes: ['wiki:read', 'organizations:read'],
        organizationGrant: {
          mode: 'selected',
          organizationIds: ['org-a'],
        },
      },
      'idem-a',
    );

    expect(hasMemberUser).toHaveBeenCalledWith('org-a', 'user-a');
    expect(reserveOperation).toHaveBeenCalledTimes(1);
    expect(reserveAllocation).toHaveBeenCalledWith('user-a', 2);
    expect(createForUser).toHaveBeenCalledWith({
      userId: 'user-a',
      name: '노트북',
      scopes: ['organizations:read', 'wiki:read'],
      organizationGrant: {
        mode: 'selected',
        organizationIds: ['org-a'],
      },
      expiresInSeconds: 2_592_000,
    });
    expect(finalizeAllocation).toHaveBeenCalledWith('allocation-a', 'key-a');
    expect(completeOperation).toHaveBeenCalledWith('operation-a', 'key-a');
    expect(result.secret).toBe('wos_mcp_one-time-secret');
  });

  it('quota slot을 얻지 못하면 provider create 전에 409 domain error로 끝낸다', async () => {
    reserveAllocation.mockResolvedValue(null);

    await expect(
      service.create(
        'user-a',
        {
          name: '노트북',
          scopes: ['wiki:read'],
          organizationGrant: {
            mode: 'selected',
            organizationIds: ['org-a'],
          },
        },
        'idem-a',
      ),
    ).rejects.toBeInstanceOf(McpAccessKeyQuotaExceededError);

    expect(createForUser).not.toHaveBeenCalled();
    expect(failOperation).toHaveBeenCalledWith('operation-a');
  });

  it('완료된 동일 idempotency 작업에서 secret을 재노출하지 않는다', async () => {
    reserveOperation.mockImplementation(async (input) => ({
      status: 'existing',
      operation: {
        ...operation,
        operation: input.operation,
        requestFingerprint: input.requestFingerprint,
        status: 'completed',
        resultingKeyId: 'key-existing',
      },
    }));

    await expect(
      service.create(
        'user-a',
        {
          name: '노트북',
          scopes: ['wiki:read'],
          organizationGrant: {
            mode: 'selected',
            organizationIds: ['org-a'],
          },
        },
        'idem-a',
      ),
    ).rejects.toMatchObject({
      code: 'MCP_ACCESS_KEY_SECRET_ALREADY_ISSUED',
      resultingKeyId: 'key-existing',
    });

    expect(createForUser).not.toHaveBeenCalled();
  });

  it('selected grant의 현재 membership이 없으면 coordination row도 만들지 않는다', async () => {
    hasMemberUser.mockResolvedValue(false);

    await expect(
      service.create(
        'user-a',
        {
          name: '노트북',
          scopes: ['wiki:read'],
          organizationGrant: {
            mode: 'selected',
            organizationIds: ['org-a'],
          },
        },
        'idem-a',
      ),
    ).rejects.toBeInstanceOf(McpAccessKeyGrantInvalidError);

    expect(reserveOperation).not.toHaveBeenCalled();
    expect(reserveAllocation).not.toHaveBeenCalled();
  });

  it('disabled key를 enable할 때 먼저 quota slot을 예약하고 finalize한다', async () => {
    const disabled = {
      ...baseRecord,
      enabled: false,
    };
    const enabled = {
      ...baseRecord,
      enabled: true,
    };
    getForUser.mockResolvedValue(disabled);
    updateForUser.mockResolvedValue(enabled);
    reserveAllocation.mockResolvedValue(allocation);
    finalizeAllocation.mockResolvedValue({
      ...allocation,
      state: 'active',
      betterAuthKeyId: 'key-a',
    });

    const result = await service.update('user-a', 'key-a', {
      enabled: true,
    });

    expect(reserveAllocation).toHaveBeenCalledWith('user-a', 2);
    expect(updateForUser).toHaveBeenCalledWith({
      userId: 'user-a',
      keyId: 'key-a',
      name: undefined,
      enabled: true,
      scopes: disabled.scopes,
      organizationGrant: disabled.organizationGrant,
      expiresInSeconds: undefined,
    });
    expect(finalizeAllocation).toHaveBeenCalledWith('allocation-a', 'key-a');
    expect(result.enabled).toBe(true);
  });

  it('active key를 disable하면 provider update 뒤 allocation을 해제한다', async () => {
    const disabled = {
      ...baseRecord,
      enabled: false,
    };
    getForUser.mockResolvedValue(baseRecord);
    updateForUser.mockResolvedValue(disabled);

    const result = await service.update('user-a', 'key-a', {
      enabled: false,
    });

    expect(reserveAllocation).not.toHaveBeenCalled();
    expect(releaseAllocationByKeyId).toHaveBeenCalledWith('user-a', 'key-a');
    expect(result.enabled).toBe(false);
  });

  it('rotate는 기존 absolute expiry의 남은 시간을 사용하고 allocation slot을 교체한다', async () => {
    const now = new Date('2026-10-07T00:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const current = {
      ...baseRecord,
      expiresAt: '2026-10-07T01:00:00.000Z',
    };
    const replacement = {
      ...baseRecord,
      id: 'key-b',
      expiresAt: current.expiresAt,
      secret: 'wos_mcp_rotated',
    };
    getForUser.mockResolvedValue(current);
    createForUser.mockResolvedValue(replacement);
    reserveOperation.mockResolvedValue({
      status: 'reserved',
      operation: { ...operation, operation: 'rotate' },
    });
    replaceAllocationKey.mockResolvedValue({
      ...allocation,
      state: 'active',
      betterAuthKeyId: 'key-b',
    });
    completeOperation.mockResolvedValue({
      ...operation,
      operation: 'rotate',
      status: 'completed',
      resultingKeyId: 'key-b',
    });

    const result = await service.rotate('user-a', 'key-a', 'rotate-a');

    expect(createForUser).toHaveBeenCalledWith({
      userId: 'user-a',
      name: '노트북',
      scopes: current.scopes,
      organizationGrant: current.organizationGrant,
      expiresInSeconds: 3_600,
    });
    expect(revoke).toHaveBeenNthCalledWith(1, 'user-a', 'key-a');
    expect(replaceAllocationKey).toHaveBeenCalledWith({
      userId: 'user-a',
      currentKeyId: 'key-a',
      replacementKeyId: 'key-b',
    });
    expect(result.secret).toBe('wos_mcp_rotated');

    jest.restoreAllMocks();
  });
});
