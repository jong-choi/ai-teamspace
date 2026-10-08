import type { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type { McpAgentTokenRevocationProvider } from '@/mcp-agent-delegations/infrastructure/oauth-server/mcp-agent-token-revocation.provider';
import type { McpAgentOauthFlowRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-oauth-flow.repository';
import {
  McpAgentDelegationFlowInvalidError,
  McpAgentDelegationRevocationError,
  McpAgentDelegationVerificationError,
} from '@/mcp-agent-delegations/mcp-agent-delegation.error';
import { McpAgentDelegationService } from '@/mcp-agent-delegations/mcp-agent-delegation.service';
import type { McpAgentDelegationCredentialService } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import type { McpAgentOauthFlowService } from '@/mcp-agent-delegations/mcp-agent-oauth-flow.service';
import type { OrganizationMembershipService } from '@/organizations/organization-membership.service';

import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

const flow = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-a',
  organizationId: 'org-a',
  oauthClientIdentity: 'work-os-agent',
  issuer: 'https://workos.example/api/auth',
  stateHash: 'a'.repeat(64),
  requestedScopes: ['organizations:read'],
  resourceUrl: 'https://workos.example/mcp',
  redirectUrl: 'https://workos.example/mcp/agent-delegation/callback',
  returnTo: '/ai',
  completionUrl:
    'https://dashboard.example/settings/mcp/consent?returnTo=%2Fai',
  verifierFormatVersion: null,
  verifierAlgorithm: null,
  verifierKeyId: null,
  verifierNonce: null,
  verifierCiphertext: null,
  verifierAuthTag: null,
  discoveryFormatVersion: null,
  discoveryAlgorithm: null,
  discoveryKeyId: null,
  discoveryNonce: null,
  discoveryCiphertext: null,
  discoveryAuthTag: null,
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  consumedAt: null,
  createdAt: new Date('2026-10-08T00:00:00.000Z'),
  updatedAt: new Date('2026-10-08T00:00:00.000Z'),
} as const;

const mcpConfig = {
  resourceUrl: 'https://workos.example/mcp',
  agentDelegation: {
    clientId: 'work-os-agent',
    clientSecret: 'x'.repeat(32),
    redirectUrl: 'https://workos.example/mcp/agent-delegation/callback',
    flowTtlSeconds: 600,
    refreshLeaseTtlSeconds: 15,
    refreshLeaseWaitMs: 5_000,
  },
};

describe('MCP Agent delegation callback', () => {
  const claimCallback = jest.fn();
  const hasMemberUser = jest.fn();
  const tokens = jest.fn();
  const revokeCredential = jest.fn();
  const revokeRefreshToken = jest.fn();

  const service = new McpAgentDelegationService(
    { getOrThrow: () => mcpConfig } as unknown as ConfigService<AllConfigType>,
    {
      tokens,
      revoke: revokeCredential,
    } as unknown as McpAgentDelegationCredentialService,
    {
      claimCallback,
    } as unknown as McpAgentOauthFlowService,
    {} as McpAgentOauthFlowRepository,
    { hasMemberUser } as unknown as OrganizationMembershipService,
    {
      revokeRefreshToken,
    } as unknown as McpAgentTokenRevocationProvider,
  );

  let finishAuthSpy: jest.SpiedFunction<
    StreamableHTTPClientTransport['finishAuth']
  >;
  let transportCloseSpy: jest.SpiedFunction<
    StreamableHTTPClientTransport['close']
  >;
  let connectSpy: jest.SpiedFunction<Client['connect']>;
  let clientCloseSpy: jest.SpiedFunction<Client['close']>;

  beforeEach(() => {
    jest.clearAllMocks();
    claimCallback.mockResolvedValue({ flow });
    hasMemberUser.mockResolvedValue(true);
    revokeCredential.mockResolvedValue(true);
    revokeRefreshToken.mockResolvedValue(undefined);
    tokens.mockResolvedValue({
      access_token: 'access-token',
      token_type: 'Bearer',
      expires_in: 300,
      scope: 'organizations:read',
      issuer: 'https://workos.example/api/auth',
    });

    finishAuthSpy = jest
      .spyOn(StreamableHTTPClientTransport.prototype, 'finishAuth')
      .mockResolvedValue(undefined);
    transportCloseSpy = jest
      .spyOn(StreamableHTTPClientTransport.prototype, 'close')
      .mockResolvedValue(undefined);
    connectSpy = jest
      .spyOn(Client.prototype, 'connect')
      .mockResolvedValue(undefined);
    clientCloseSpy = jest
      .spyOn(Client.prototype, 'close')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('token 교환 전에 callback flow를 선점하고 callback 전체 params를 finishAuth에 넘긴 뒤 fresh reconnect한다', async () => {
    const params = new URLSearchParams({
      code: 'authorization-code',
      state: 'raw-state',
      iss: 'https://workos.example/api/auth',
    });

    await expect(service.finish(params)).resolves.toEqual({
      completionUrl: flow.completionUrl,
    });

    expect(claimCallback).toHaveBeenCalledWith('raw-state');
    expect(claimCallback.mock.invocationCallOrder[0]).toBeLessThan(
      finishAuthSpy.mock.invocationCallOrder[0] ?? 0,
    );
    expect(finishAuthSpy).toHaveBeenCalledWith(params);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(clientCloseSpy).toHaveBeenCalledTimes(1);
    expect(transportCloseSpy).toHaveBeenCalled();
  });

  it('선점한 flow의 token exchange가 실패하면 attacker-controlled error를 외부 메시지로 노출하지 않는다', async () => {
    finishAuthSpy.mockRejectedValue(
      new Error('error_description=attacker-controlled-secret'),
    );

    const error = await service
      .finish(
        new URLSearchParams({
          error: 'access_denied',
          error_description: 'attacker-controlled-secret',
          state: 'raw-state',
        }),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpAgentDelegationFlowInvalidError);
    expect((error as Error).message).not.toContain(
      'attacker-controlled-secret',
    );
    expect(claimCallback).toHaveBeenCalledWith('raw-state');
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('token 저장 뒤 MCP 재접속 검증이 실패하면 credential을 폐기하고 flow 오류와 구분해 알린다', async () => {
    tokens.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      issuer: 'https://workos.example/api/auth',
    });
    connectSpy.mockRejectedValue(new Error('Unsupported protocol version'));

    const error = await service
      .finish(
        new URLSearchParams({ code: 'authorization-code', state: 'raw-state' }),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(McpAgentDelegationVerificationError);
    expect(revokeRefreshToken).toHaveBeenCalledWith('refresh-token');
    expect(revokeCredential).toHaveBeenCalledWith({
      userId: flow.userId,
      organizationId: flow.organizationId,
    });
  });

  it('revoke는 refresh token을 Better Auth authorization server에서 폐기한 뒤 local delegation을 revoke한다', async () => {
    tokens.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      issuer: 'https://workos.example/api/auth',
    });

    await service.revoke({
      userId: 'user-a',
      organizationId: 'org-a',
    });

    expect(revokeRefreshToken).toHaveBeenCalledWith('refresh-token');
    expect(revokeCredential).toHaveBeenCalledWith({
      userId: 'user-a',
      organizationId: 'org-a',
    });
  });

  it('원격 refresh-token revoke가 실패해도 local delegation은 반드시 revoke한다', async () => {
    tokens.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      issuer: 'https://workos.example/api/auth',
    });
    revokeRefreshToken.mockRejectedValue(new Error('remote secret detail'));

    await expect(
      service.revoke({
        userId: 'user-a',
        organizationId: 'org-a',
      }),
    ).rejects.toBeInstanceOf(McpAgentDelegationRevocationError);

    expect(revokeCredential).toHaveBeenCalledWith({
      userId: 'user-a',
      organizationId: 'org-a',
    });
  });

  it('state가 없으면 SDK transport를 생성하기 전에 fail-closed한다', async () => {
    await expect(
      service.finish(new URLSearchParams({ code: 'authorization-code' })),
    ).rejects.toBeInstanceOf(McpAgentDelegationFlowInvalidError);

    expect(claimCallback).not.toHaveBeenCalled();
    expect(finishAuthSpy).not.toHaveBeenCalled();
  });
});
