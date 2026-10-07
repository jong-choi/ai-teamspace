import type { ConfigService } from '@nestjs/config';

import type { Auth } from '@/auth/auth';
import type { AllConfigType } from '@/config/config.type';
import { BetterAuthMcpOAuthConnectionAdapter } from '@/mcp-oauth-connections/infrastructure/oauth-connection/better-auth/better-auth-mcp-oauth-connection.adapter';

import type { AuthService } from '@thallesp/nestjs-better-auth';

const resourceUrl = 'https://workos.example/mcp';
const otherResource = 'https://other.example/api';

describe('Better Auth MCP OAuth connection provider', () => {
  const findMany = jest.fn();
  const findOne = jest.fn();
  const updateMany = jest.fn();
  const deleteRecord = jest.fn();

  const adapter = new BetterAuthMcpOAuthConnectionAdapter(
    {
      instance: {
        $context: Promise.resolve({
          adapter: {
            findMany,
            findOne,
            updateMany,
            delete: deleteRecord,
          },
        }),
      },
    } as unknown as AuthService<Auth>,
    {
      getOrThrow: () => ({ resourceUrl }),
    } as unknown as ConfigService<AllConfigType>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('current user의 canonical MCP resource consent만 verified stored client metadata로 노출한다', async () => {
    findMany
      .mockResolvedValueOnce([
        {
          id: 'consent-mcp',
          clientId: 'https://client.example/metadata.json',
          userId: 'user-a',
          resources: [resourceUrl],
          scopes: ['offline_access', 'wiki:write', 'wiki:read'],
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
          updatedAt: new Date('2026-10-02T00:00:00.000Z'),
        },
        {
          id: 'consent-other-resource',
          clientId: 'other-client',
          userId: 'user-a',
          resources: [otherResource],
          scopes: ['wiki:read'],
          createdAt: new Date('2026-10-03T00:00:00.000Z'),
          updatedAt: new Date('2026-10-03T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          clientId: 'https://client.example/metadata.json',
          name: 'Verified MCP Client',
          applicationType: 'native',
          tokenEndpointAuthMethod: 'none',
          disabled: false,
        },
      ]);

    const result = await adapter.listForUser('user-a');

    expect(result).toEqual([
      {
        consentId: 'consent-mcp',
        clientId: 'https://client.example/metadata.json',
        displayName: 'Verified MCP Client',
        applicationType: 'native',
        publicClient: true,
        scopes: ['wiki:read', 'wiki:write'],
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
        status: 'approved',
      },
    ]);
    expect(findMany).toHaveBeenNthCalledWith(1, {
      model: 'oauthConsent',
      where: [{ field: 'userId', value: 'user-a' }],
    });
  });

  it('disconnect는 같은 user/client 중 canonical MCP resource token만 revoke한 뒤 consent를 삭제한다', async () => {
    findOne.mockResolvedValue({
      id: 'consent-mcp',
      clientId: 'client-a',
      userId: 'user-a',
      resources: [resourceUrl],
      scopes: ['wiki:read'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    findMany
      .mockResolvedValueOnce([
        {
          id: 'refresh-mcp',
          resources: [resourceUrl],
          revoked: null,
        },
        {
          id: 'refresh-other',
          resources: [otherResource],
          revoked: null,
        },
        {
          id: 'refresh-old',
          resources: [resourceUrl],
          revoked: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'access-mcp',
          resources: [resourceUrl],
          revoked: null,
        },
        {
          id: 'access-other',
          resources: [otherResource],
          revoked: null,
        },
      ]);
    updateMany.mockResolvedValue(1);

    await expect(adapter.revokeForUser('user-a', 'consent-mcp')).resolves.toBe(
      true,
    );

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
      model: 'oauthRefreshToken',
      where: [
        {
          field: 'id',
          operator: 'in',
          value: ['refresh-mcp'],
        },
      ],
    });
    expect(updateMany.mock.calls[1]?.[0]).toMatchObject({
      model: 'oauthAccessToken',
      where: [
        {
          field: 'id',
          operator: 'in',
          value: ['access-mcp'],
        },
      ],
    });
    expect(deleteRecord).toHaveBeenCalledWith({
      model: 'oauthConsent',
      where: [{ field: 'id', value: 'consent-mcp' }],
    });
  });

  it('다른 user 또는 다른 resource consent는 token 조회/삭제 없이 no-op한다', async () => {
    findOne.mockResolvedValue({
      id: 'consent-other',
      clientId: 'client-a',
      userId: 'user-a',
      resources: [otherResource],
      scopes: ['wiki:read'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      adapter.revokeForUser('user-a', 'consent-other'),
    ).resolves.toBe(false);

    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(deleteRecord).not.toHaveBeenCalled();
  });
});
