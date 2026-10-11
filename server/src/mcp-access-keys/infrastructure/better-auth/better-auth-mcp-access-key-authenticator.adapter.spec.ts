import type { Auth } from '@/auth/auth';
import { BetterAuthMcpAccessKeyAuthenticatorAdapter } from '@/mcp-access-keys/infrastructure/better-auth/better-auth-mcp-access-key-authenticator.adapter';
import {
  McpAccessKeyAuthenticationError,
  McpAccessKeyRateLimitedError,
} from '@/mcp-access-keys/mcp-access-key.error';

import type { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth';

describe('Better Auth MCP access key authenticator', () => {
  const verifyApiKey = jest.fn();
  const findUserById = jest.fn();
  const authService = {
    api: { verifyApiKey },
    instance: {
      $context: Promise.resolve({
        internalAdapter: { findUserById },
      }),
    },
  } as unknown as AuthService<Auth>;
  const authenticator = new BetterAuthMcpAccessKeyAuthenticatorAdapter(
    authService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findUserById.mockResolvedValue({ id: 'user-a' });
  });

  it('verifyApiKey를 요청당 한 번 호출하고 raw-free context를 반환한다', async () => {
    verifyApiKey.mockResolvedValue({
      valid: true,
      error: null,
      key: {
        id: 'key-a',
        configId: 'teamspace-mcp-user',
        referenceId: 'user-a',
        permissions: {
          wiki: ['write', 'read'],
          organizations: ['read'],
        },
        metadata: {
          kind: 'teamspace-mcp-user',
          version: 1,
          organizationGrant: {
            mode: 'selected',
            organizationIds: ['org-b', 'org-a', 'org-b'],
          },
        },
      },
    });

    const result = await authenticator.authenticate('wos_mcp_secret');

    expect(result).toEqual({
      authMethod: 'api-key',
      credentialId: 'key-a',
      userId: 'user-a',
      clientId: null,
      scopes: ['organizations:read', 'wiki:read', 'wiki:write'],
      allowedOrganizationIds: ['org-a', 'org-b'],
    });
    expect(JSON.stringify(result)).not.toContain('wos_mcp_secret');
    expect(verifyApiKey).toHaveBeenCalledTimes(1);
    expect(verifyApiKey).toHaveBeenCalledWith({
      body: {
        configId: 'teamspace-mcp-user',
        key: 'wos_mcp_secret',
      },
    });
  });

  it('invalid key 결과를 opaque authentication error로 거부한다', async () => {
    verifyApiKey.mockResolvedValue({
      valid: false,
      error: { code: 'INVALID_API_KEY', message: 'INVALID_API_KEY' },
      key: null,
    });

    await expect(
      authenticator.authenticate('wos_mcp_invalid'),
    ).rejects.toBeInstanceOf(McpAccessKeyAuthenticationError);
    expect(verifyApiKey).toHaveBeenCalledTimes(1);
  });

  it('Better Auth rate limit APIError는 429용 retry 정보를 보존한다', async () => {
    verifyApiKey.mockRejectedValue(
      new APIError('TOO_MANY_REQUESTS', {
        code: 'RATE_LIMITED',
        message: 'rate limited',
        details: { tryAgainIn: 2_500 },
      }),
    );

    const error = await authenticator
      .authenticate('wos_mcp_secret')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpAccessKeyRateLimitedError);
    expect(error).toMatchObject({ retryAfterMs: 2_500 });
    expect(verifyApiKey).toHaveBeenCalledTimes(1);
  });

  it('owner user가 더 이상 존재하지 않으면 fail-closed한다', async () => {
    verifyApiKey.mockResolvedValue({
      valid: true,
      error: null,
      key: {
        id: 'key-a',
        configId: 'teamspace-mcp-user',
        referenceId: 'user-a',
        permissions: { organizations: ['read'] },
        metadata: {
          kind: 'teamspace-mcp-user',
          version: 1,
          organizationGrant: {
            mode: 'all-user-organizations',
          },
        },
      },
    });
    findUserById.mockResolvedValue(null);

    await expect(
      authenticator.authenticate('wos_mcp_secret'),
    ).rejects.toBeInstanceOf(McpAccessKeyAuthenticationError);
    expect(verifyApiKey).toHaveBeenCalledTimes(1);
  });

  it('metadata 또는 permission이 canonical contract와 다르면 fail-closed한다', async () => {
    verifyApiKey.mockResolvedValue({
      valid: true,
      error: null,
      key: {
        id: 'key-a',
        configId: 'teamspace-mcp-user',
        referenceId: 'user-a',
        permissions: { wiki: ['admin'] },
        metadata: {
          kind: 'other-product',
          version: 1,
          organizationGrant: {
            mode: 'all-user-organizations',
          },
        },
      },
    });

    await expect(
      authenticator.authenticate('wos_mcp_secret'),
    ).rejects.toBeInstanceOf(McpAccessKeyAuthenticationError);
    expect(verifyApiKey).toHaveBeenCalledTimes(1);
  });
});
