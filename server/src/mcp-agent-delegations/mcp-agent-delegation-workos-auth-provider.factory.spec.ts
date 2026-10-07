import type { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type { McpAgentDelegationRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-delegation.repository';
import { McpAgentDelegationRequiredError } from '@/mcp-agent-delegations/mcp-agent-delegation.error';
import type { McpAgentDelegationCredentialService } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import { McpAgentDelegationWorkOsAuthProviderFactory } from '@/mcp-agent-delegations/mcp-agent-delegation-workos-auth-provider.factory';
import type { McpAgentOauthFlowService } from '@/mcp-agent-delegations/mcp-agent-oauth-flow.service';

const config = {
  resourceUrl: 'https://workos.example/mcp',
  agentDelegation: {
    clientId: 'work-os-agent',
    clientSecret: 'x'.repeat(32),
    redirectUrl: 'https://workos.example/mcp/agent-delegation/callback',
    flowTtlSeconds: 600,
    refreshLeaseTtlSeconds: 15,
    refreshLeaseWaitMs: 100,
  },
};

describe('Work OS MCP Agent auth provider factory', () => {
  const tokens = jest.fn();
  const latest = jest.fn();
  const acquireRefreshLease = jest.fn();
  const releaseRefreshLease = jest.fn();

  const factory = new McpAgentDelegationWorkOsAuthProviderFactory(
    { getOrThrow: () => config } as unknown as ConfigService<AllConfigType>,
    {
      tokens,
      latest,
    } as unknown as McpAgentDelegationCredentialService,
    {} as McpAgentOauthFlowService,
    {
      acquireRefreshLease,
      releaseRefreshLease,
    } as unknown as McpAgentDelegationRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('token()은 actor-bound encrypted credential service 결과만 반환한다', async () => {
    tokens.mockResolvedValue({
      access_token: 'access-a',
      token_type: 'Bearer',
      issuer: 'https://workos.example/api/auth',
    });

    const provider = factory.create({
      userId: 'user-a',
      organizationId: 'org-a',
      permissions: [],
    });

    await expect(provider.token()).resolves.toBe('access-a');
    expect(tokens).toHaveBeenCalledWith({
      userId: 'user-a',
      organizationId: 'org-a',
    });
  });

  it('canonical MCP_RESOURCE_URL이 아닌 401은 refresh를 시도하지 않고 거부한다', async () => {
    tokens.mockResolvedValue({
      access_token: 'access-a',
      token_type: 'Bearer',
      issuer: 'https://workos.example/api/auth',
    });

    const provider = factory.create({
      userId: 'user-a',
      organizationId: 'org-a',
      permissions: [],
    });
    await provider.token();

    await expect(
      provider.onUnauthorized?.({
        response: new Response(null, { status: 401 }),
        serverUrl: new URL('https://evil.example/mcp'),
        fetchFn: jest.fn() as never,
      }),
    ).rejects.toBeInstanceOf(McpAgentDelegationRequiredError);

    expect(latest).not.toHaveBeenCalled();
    expect(acquireRefreshLease).not.toHaveBeenCalled();
  });

  it('다른 replica가 lease를 잡은 경우 token 변경을 bounded wait하고 중복 refresh하지 않는다', async () => {
    tokens
      .mockResolvedValueOnce({
        access_token: 'old-access',
        token_type: 'Bearer',
        issuer: 'https://workos.example/api/auth',
      })
      .mockResolvedValueOnce({
        access_token: 'new-access',
        token_type: 'Bearer',
        issuer: 'https://workos.example/api/auth',
      });
    latest.mockResolvedValue({
      id: 'delegation-a',
      issuer: 'https://workos.example/api/auth',
    });
    acquireRefreshLease.mockResolvedValue(null);

    const provider = factory.create({
      userId: 'user-a',
      organizationId: 'org-a',
      permissions: [],
    });
    await expect(provider.token()).resolves.toBe('old-access');

    await expect(
      provider.onUnauthorized?.({
        response: new Response(null, { status: 401 }),
        serverUrl: new URL(config.resourceUrl),
        fetchFn: jest.fn() as never,
      }),
    ).resolves.toBeUndefined();

    expect(acquireRefreshLease).toHaveBeenCalledTimes(1);
    expect(tokens).toHaveBeenCalledTimes(2);
    expect(releaseRefreshLease).not.toHaveBeenCalled();
  });
});
