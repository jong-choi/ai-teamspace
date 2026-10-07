import type { ConfigService } from '@nestjs/config';

import type { Auth } from '@/auth/auth';
import type { AllConfigType } from '@/config/config.type';
import { BetterAuthMcpAccessKeyAdapter } from '@/mcp-access-keys/infrastructure/access-key/better-auth/better-auth-mcp-access-key.adapter';

import type { AuthService } from '@thallesp/nestjs-better-auth';

const createdAt = new Date('2026-10-07T00:00:00.000Z');
const updatedAt = new Date('2026-10-07T01:00:00.000Z');
const stored = {
  id: 'key-a',
  configId: 'workos-mcp-user',
  name: 'CI',
  start: 'wos_mc',
  prefix: 'wos_mcp_',
  referenceId: 'user-a',
  key: 'hashed-secret-must-not-leak',
  enabled: true,
  rateLimitEnabled: true,
  rateLimitTimeWindow: 60_000,
  rateLimitMax: 60,
  requestCount: 0,
  remaining: null,
  refillInterval: null,
  refillAmount: null,
  lastRefillAt: null,
  lastRequest: null,
  expiresAt: new Date('2099-11-06T00:00:00.000Z'),
  createdAt,
  updatedAt,
  permissions: JSON.stringify({
    organizations: ['read'],
    wiki: ['read'],
  }),
  metadata: JSON.stringify({
    kind: 'workos-mcp-user',
    version: 1,
    organizationGrant: {
      mode: 'selected',
      organizationIds: ['org-a'],
    },
  }),
};

describe('Better Auth MCP access key provider', () => {
  const createApiKey = jest.fn();
  const updateApiKey = jest.fn();
  const findMany = jest.fn();
  const findOne = jest.fn();
  const deleteRecord = jest.fn();

  const authService = {
    api: { createApiKey, updateApiKey },
    instance: {
      $context: Promise.resolve({
        adapter: {
          findMany,
          findOne,
          delete: deleteRecord,
        },
      }),
    },
  } as unknown as AuthService<Auth>;

  const configService = {
    getOrThrow: () => ({
      accessKey: {
        rateLimitWindowMs: 60_000,
        rateLimitMax: 60,
      },
    }),
  } as unknown as ConfigService<AllConfigType>;

  const provider = new BetterAuthMcpAccessKeyAdapter(
    authService,
    configService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create는 Work OS 정책 필드를 server-side로 주입하고 secret을 한 번 반환한다', async () => {
    createApiKey.mockResolvedValue({
      ...stored,
      key: 'wos_mcp_one-time-secret',
      permissions: {
        organizations: ['read'],
        wiki: ['read'],
      },
      metadata: {
        kind: 'workos-mcp-user',
        version: 1,
        organizationGrant: {
          mode: 'selected',
          organizationIds: ['org-a'],
        },
      },
    });

    const result = await provider.createForUser({
      userId: 'user-a',
      name: 'CI',
      scopes: ['organizations:read', 'wiki:read'],
      organizationGrant: {
        mode: 'selected',
        organizationIds: ['org-a'],
      },
      expiresInSeconds: 2_592_000,
    });

    expect(createApiKey).toHaveBeenCalledWith({
      body: {
        configId: 'workos-mcp-user',
        userId: 'user-a',
        name: 'CI',
        prefix: 'wos_mcp_',
        expiresIn: 2_592_000,
        permissions: {
          organizations: ['read'],
          wiki: ['read'],
        },
        metadata: {
          kind: 'workos-mcp-user',
          version: 1,
          organizationGrant: {
            mode: 'selected',
            organizationIds: ['org-a'],
          },
        },
        rateLimitEnabled: true,
        rateLimitTimeWindow: 60_000,
        rateLimitMax: 60,
      },
    });
    expect(result.secret).toBe('wos_mcp_one-time-secret');
    expect(JSON.stringify(result)).not.toContain('hashed-secret-must-not-leak');
  });

  it('generic Better Auth primitive로 생긴 비canonical key는 product list에서 제외한다', async () => {
    findMany.mockResolvedValue([
      stored,
      {
        ...stored,
        id: 'generic-key',
        metadata: null,
        permissions: null,
      },
    ]);

    const result = await provider.listForUser('user-a');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('key-a');
  });

  it('list는 configId와 owner로 격리하고 hash를 domain record에 노출하지 않는다', async () => {
    findMany.mockResolvedValue([stored]);

    const result = await provider.listForUser('user-a');

    expect(findMany).toHaveBeenCalledWith({
      model: 'apikey',
      where: [
        { field: 'configId', value: 'workos-mcp-user' },
        { field: 'referenceId', value: 'user-a' },
      ],
    });
    expect(result).toEqual([
      {
        id: 'key-a',
        name: 'CI',
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
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(stored.key);
  });
});
