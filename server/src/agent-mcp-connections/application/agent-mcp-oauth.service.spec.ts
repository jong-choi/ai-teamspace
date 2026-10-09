import type { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import { AgentMcpOauthService } from '@/agent-mcp-connections/application/agent-mcp-oauth.service';
import type { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import type { AgentMcpOauthStateService } from '@/agent-mcp-connections/application/agent-mcp-oauth-state.service';
import { AgentMcpConnectionSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import {
  AgentMcpOauthAuthorizationRequiredError,
  AgentMcpOauthCredentialInvalidError,
} from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import type { SafeOutboundHttp } from '@/agent-mcp-connections/infrastructure/http/safe-outbound-http';
import type { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';

describe('external MCP OAuth runtime refresh coordination', () => {
  const actor: AgentActor = {
    userId: 'user-1',
    organizationId: 'org-1',
    permissions: [],
  };

  function connection() {
    return AgentMcpConnectionSchema.parse({
      id: '0199d54e-282e-7adf-8000-000000000001',
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      displayName: 'OAuth MCP',
      namespace: 'extoauth1',
      endpoint: 'https://mcp.example.com/mcp',
      transport: 'http',
      authKind: 'oauth',
      enabled: true,
      toolPolicyMode: 'selected',
      lastTestedAt: null,
      lastErrorCategory: null,
      revision: 0,
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
      updatedAt: new Date('2026-10-07T00:00:00.000Z'),
    });
  }

  function dependencies() {
    const repositoryAcquireCredentialRefreshLeaseMock = jest
      .fn()
      .mockResolvedValue(true);
    const repositoryReleaseCredentialRefreshLeaseMock = jest
      .fn()
      .mockResolvedValue(true);
    const repositoryRecordHealthMock = jest
      .fn()
      .mockResolvedValue(connection());
    const repository = {
      acquireCredentialRefreshLease:
        repositoryAcquireCredentialRefreshLeaseMock,
      releaseCredentialRefreshLease:
        repositoryReleaseCredentialRefreshLeaseMock,
      recordHealth: repositoryRecordHealthMock,
    } as unknown as AgentMcpConnectionRepository;
    const credentialsTokensMock = jest
      .fn()
      .mockResolvedValueOnce({
        access_token: 'access-one',
        token_type: 'Bearer',
        issuer: 'https://auth.example.com/',
      })
      .mockResolvedValueOnce({
        access_token: 'access-two',
        token_type: 'Bearer',
        issuer: 'https://auth.example.com/',
      });
    const credentials = {
      tokens: credentialsTokensMock,
    } as unknown as AgentMcpOauthCredentialService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue({
        oauthCallbackUrl:
          'https://app.example.com/agent/mcp-connections/oauth/callback',
        connectTimeoutMs: 10_000,
        toolTimeoutMs: 30_000,
      }),
    } as unknown as ConfigService<AllConfigType>;

    return {
      repositoryAcquireCredentialRefreshLeaseMock,
      repositoryReleaseCredentialRefreshLeaseMock,
      repositoryRecordHealthMock,
      credentialsTokensMock,
      repository,
      credentials,
      config,
    };
  }

  test('lease 획득 뒤 이미 갱신된 token을 발견하면 중복 refresh 없이 lease를 해제한다', async () => {
    const deps = dependencies();
    const {
      repositoryAcquireCredentialRefreshLeaseMock,
      repositoryReleaseCredentialRefreshLeaseMock,
      credentialsTokensMock,
      repositoryRecordHealthMock,
    } = deps;
    const current = connection();
    const service = new AgentMcpOauthService(
      deps.repository,
      deps.credentials,
      {} as AgentMcpOauthStateService,
      {} as SafeOutboundHttp,
      deps.config,
    );
    const provider = service.createRuntimeAuthProvider(actor, current);

    await expect(provider.token()).resolves.toBe('access-one');
    await expect(
      provider.onUnauthorized!({
        response: new Response(null, { status: 401 }),
        serverUrl: new URL(current.endpoint),
        fetchFn: jest.fn(),
      }),
    ).resolves.toBeUndefined();

    expect(repositoryAcquireCredentialRefreshLeaseMock).toHaveBeenCalledWith(
      actor.userId,
      actor.organizationId,
      current.id,
      expect.any(String),
      expect.any(Date),
      expect.any(Date),
    );
    expect(repositoryReleaseCredentialRefreshLeaseMock).toHaveBeenCalledWith(
      actor.userId,
      actor.organizationId,
      current.id,
      expect.any(String),
    );
    expect(credentialsTokensMock).toHaveBeenCalledTimes(2);
    expect(repositoryRecordHealthMock).toHaveBeenCalledWith(
      actor.userId,
      actor.organizationId,
      current.id,
      expect.any(Date),
      null,
    );
  });

  test('refresh authorization required 실패는 connection health에 기록한다', async () => {
    const deps = dependencies();
    const {
      repositoryAcquireCredentialRefreshLeaseMock,
      repositoryRecordHealthMock,
    } = deps;
    const current = connection();
    repositoryAcquireCredentialRefreshLeaseMock.mockRejectedValue(
      new AgentMcpOauthAuthorizationRequiredError(),
    );
    const service = new AgentMcpOauthService(
      deps.repository,
      deps.credentials,
      {} as AgentMcpOauthStateService,
      {} as SafeOutboundHttp,
      deps.config,
    );
    const provider = service.createRuntimeAuthProvider(actor, current);

    await expect(provider.token()).resolves.toBe('access-one');
    await expect(
      provider.onUnauthorized!({
        response: new Response(null, { status: 401 }),
        serverUrl: new URL(current.endpoint),
        fetchFn: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(AgentMcpOauthAuthorizationRequiredError);

    expect(repositoryRecordHealthMock).toHaveBeenCalledWith(
      actor.userId,
      actor.organizationId,
      current.id,
      expect.any(Date),
      'authorization_required',
    );
  });

  test('401 resource identity가 connection endpoint와 다르면 refresh를 시작하지 않는다', async () => {
    const deps = dependencies();
    const { repositoryAcquireCredentialRefreshLeaseMock } = deps;
    const current = connection();
    const service = new AgentMcpOauthService(
      deps.repository,
      deps.credentials,
      {} as AgentMcpOauthStateService,
      {} as SafeOutboundHttp,
      deps.config,
    );
    const provider = service.createRuntimeAuthProvider(actor, current);

    await expect(
      provider.onUnauthorized!({
        response: new Response(null, { status: 401 }),
        serverUrl: new URL('https://other.example.com/mcp'),
        fetchFn: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(AgentMcpOauthCredentialInvalidError);
    expect(repositoryAcquireCredentialRefreshLeaseMock).not.toHaveBeenCalled();
  });
});
