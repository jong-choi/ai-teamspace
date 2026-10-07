import { AgentMcpConnectionsService } from '@/agent-mcp-connections/application/agent-mcp-connections.service';
import type { AgentMcpCredentialService } from '@/agent-mcp-connections/application/agent-mcp-credential.service';
import type { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import type { AgentMcpOauthService } from '@/agent-mcp-connections/application/agent-mcp-oauth.service';
import {
  AgentMcpConnectionCredentialRequiredError,
  AgentMcpConnectionRevisionConflictError,
  AgentMcpDiscoveryFailedError,
} from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import { AgentMcpConnectionSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import type { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import type { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';
import type { OrganizationsService } from '@/organizations/organizations.service';

import type { ConfigService } from '@nestjs/config';

describe('external MCP connection application service', () => {
  const context = {
    userId: 'user-1',
    activeOrganizationIdCandidate: 'org-1',
  };

  function connection(
    overrides: Partial<ReturnType<typeof AgentMcpConnectionSchema.parse>> = {},
  ) {
    return AgentMcpConnectionSchema.parse({
      id: '0199d54e-282e-7adf-8000-000000000001',
      ownerUserId: 'user-1',
      organizationId: 'org-1',
      displayName: 'External',
      namespace: 'extexample1',
      endpoint: 'https://example.com/mcp',
      transport: 'http',
      authKind: 'bearer',
      enabled: false,
      toolPolicyMode: 'selected',
      lastTestedAt: null,
      lastErrorCategory: null,
      revision: 2,
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
      updatedAt: new Date('2026-10-07T00:00:00.000Z'),
      ...overrides,
    });
  }

  function dependencies() {
    const repository = {
      listOwned: jest.fn().mockResolvedValue([]),
      createPendingConnection: jest.fn(),
      findOwned: jest.fn(),
      updateIfRevision: jest.fn(),
      updateSecurityBoundaryIfRevision: jest.fn(),
      updateToolPolicyIfRevision: jest.fn(),
      removeOwned: jest.fn().mockResolvedValue(false),
      recordHealth: jest
        .fn()
        .mockImplementation(
          async (
            _ownerUserId,
            _organizationId,
            _connectionId,
            testedAt,
            lastErrorCategory,
          ) =>
            connection({
              lastTestedAt: testedAt,
              lastErrorCategory,
            }),
        ),
      findCredentialForOwnedConnection: jest.fn().mockResolvedValue(null),
      listEnabledTools: jest.fn().mockResolvedValue([]),
    } as unknown as AgentMcpConnectionRepository;
    const credentials = {
      saveBearerToken: jest.fn().mockResolvedValue(undefined),
    } as unknown as AgentMcpCredentialService;
    const oauthCredentials = {
      hasAccessToken: jest.fn().mockResolvedValue(false),
    } as unknown as AgentMcpOauthCredentialService;
    const oauth = {
      start: jest.fn(),
      finish: jest.fn(),
    } as unknown as AgentMcpOauthService;
    const discovery = {
      discover: jest.fn(),
      discoverWithBearerToken: jest.fn().mockResolvedValue({ tools: [] }),
    };
    const organizations = {
      getActive: jest.fn().mockResolvedValue({
        activeOrganization: {
          organization: { id: 'org-1' },
        },
      }),
    } as unknown as OrganizationsService;
    const configService = {
      getOrThrow: jest.fn().mockReturnValue({
        maxConnectionsPerUser: 10,
        maxToolsPerConnection: 100,
      }),
    } as unknown as ConfigService<AllConfigType>;

    return {
      repository,
      credentials,
      oauthCredentials,
      oauth,
      discovery,
      organizations,
      configService,
    };
  }

  test('OAuth callback 성공 뒤 fresh discovery로 health를 ready로 갱신한다', async () => {
    const deps = dependencies();
    const oauthConnection = connection({
      authKind: 'oauth',
      enabled: true,
      lastErrorCategory: 'discovery_failed',
    });
    const healthyConnection = connection({
      authKind: 'oauth',
      enabled: true,
      lastTestedAt: new Date('2026-10-08T00:00:00.000Z'),
      lastErrorCategory: null,
    });
    jest.mocked(deps.oauth.finish).mockResolvedValue(oauthConnection);
    jest.mocked(deps.discovery.discover).mockResolvedValue({ tools: [] });
    jest
      .mocked(deps.repository.recordHealth)
      .mockResolvedValue(healthyConnection);
    jest.mocked(deps.oauthCredentials.hasAccessToken).mockResolvedValue(true);
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    const result = await service.finishOauth(
      context,
      new URLSearchParams({ code: 'code', state: 'state' }),
    );

    expect(deps.discovery.discover).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      oauthConnection,
    );
    expect(deps.repository.recordHealth).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      oauthConnection.id,
      expect.any(Date),
      null,
    );
    expect(result.status).toBe('ready');
    expect(result.credentialConfigured).toBe(true);
  });

  test('OAuth callback 뒤 fresh discovery 실패는 credential을 보존하고 health 상태로 반환한다', async () => {
    const deps = dependencies();
    const oauthConnection = connection({ authKind: 'oauth', enabled: true });
    const unavailableConnection = connection({
      authKind: 'oauth',
      enabled: true,
      lastTestedAt: new Date('2026-10-08T00:00:00.000Z'),
      lastErrorCategory: 'connection_unavailable',
    });
    jest.mocked(deps.oauth.finish).mockResolvedValue(oauthConnection);
    jest
      .mocked(deps.discovery.discover)
      .mockRejectedValue(new TypeError('remote secret-like network failure'));
    jest
      .mocked(deps.repository.recordHealth)
      .mockResolvedValue(unavailableConnection);
    jest.mocked(deps.oauthCredentials.hasAccessToken).mockResolvedValue(true);
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    const result = await service.finishOauth(
      context,
      new URLSearchParams({ code: 'code', state: 'state' }),
    );

    expect(deps.repository.recordHealth).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      oauthConnection.id,
      expect.any(Date),
      'connection_unavailable',
    );
    expect(result.status).toBe('unavailable');
    expect(result.credentialConfigured).toBe(true);
  });

  test('인증 없는 create도 remote discovery를 통과한 뒤 반환한다', async () => {
    const deps = dependencies();
    const created = connection({ authKind: 'none', revision: 0 });
    jest
      .mocked(deps.repository.createPendingConnection)
      .mockResolvedValue(created);
    jest.mocked(deps.discovery.discover).mockResolvedValue({ tools: [] });
    const auditPublisher = {
      publish: jest.fn().mockRejectedValue(new Error('audit sink unavailable')),
    } as unknown as AgentMcpAuditPublisher;
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
      auditPublisher,
    );

    await expect(
      service.create(context, {
        displayName: 'External',
        endpoint: 'https://example.com/mcp',
        authKind: 'none',
      }),
    ).resolves.toMatchObject({ id: created.id, authKind: 'none' });

    expect(deps.discovery.discover).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      created,
    );
    expect(deps.repository.removeOwned).not.toHaveBeenCalled();
    expect(auditPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'agent_mcp.discovery.completed',
        connectionId: created.id,
        resultCode: 'ok',
        toolCount: 0,
      }),
    );
    expect(auditPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'agent_mcp.connection.created',
        connectionId: created.id,
        resultCode: 'ok',
      }),
    );
  });

  test('인증 없는 preflight 실패는 pending connection을 정리한다', async () => {
    const deps = dependencies();
    const created = connection({ authKind: 'none', revision: 0 });
    jest
      .mocked(deps.repository.createPendingConnection)
      .mockResolvedValue(created);
    jest
      .mocked(deps.discovery.discover)
      .mockRejectedValue(new TypeError('remote private detail'));
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    await expect(
      service.create(context, {
        displayName: 'External',
        endpoint: 'https://example.com/mcp',
        authKind: 'none',
      }),
    ).rejects.toBeInstanceOf(AgentMcpDiscoveryFailedError);

    expect(deps.repository.removeOwned).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      created.id,
      created.revision,
    );
  });

  test('bearer create는 secret을 저장하지만 응답에는 노출하지 않는다', async () => {
    const deps = dependencies();
    const created = connection({ revision: 0 });
    jest
      .mocked(deps.repository.createPendingConnection)
      .mockResolvedValue(created);
    jest
      .mocked(deps.repository.findCredentialForOwnedConnection)
      .mockResolvedValue({} as never);
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    const result = await service.create(context, {
      displayName: 'External',
      endpoint: 'https://example.com/mcp',
      authKind: 'bearer',
      bearerToken: 'secret-token',
    });

    expect(deps.discovery.discoverWithBearerToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      created,
      'secret-token',
    );
    expect(deps.credentials.saveBearerToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      created.id,
      'secret-token',
    );
    expect(
      jest.mocked(deps.discovery.discoverWithBearerToken).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      jest.mocked(deps.credentials.saveBearerToken).mock
        .invocationCallOrder[0]!,
    );
    expect(result).not.toHaveProperty('bearerToken');
    expect(result).not.toHaveProperty('endpoint');
    expect(result.publicHost).toBe('example.com');
  });

  test('bearer preflight 실패는 secret을 저장하지 않고 pending connection을 정리한다', async () => {
    const deps = dependencies();
    const created = connection({ revision: 0 });
    jest
      .mocked(deps.repository.createPendingConnection)
      .mockResolvedValue(created);
    jest
      .mocked(deps.discovery.discoverWithBearerToken)
      .mockRejectedValue(new TypeError('remote secret-like failure'));
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    await expect(
      service.create(context, {
        displayName: 'External',
        endpoint: 'https://example.com/mcp',
        authKind: 'bearer',
        bearerToken: 'secret-token',
      }),
    ).rejects.toBeInstanceOf(AgentMcpDiscoveryFailedError);

    expect(deps.credentials.saveBearerToken).not.toHaveBeenCalled();
    expect(deps.repository.removeOwned).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      created.id,
      created.revision,
    );
  });

  test('endpoint 변경은 connection을 disable하고 기존 security state를 폐기한다', async () => {
    const deps = dependencies();
    const current = connection({ enabled: true });
    const updated = connection({
      endpoint: 'https://new.example.com/mcp',
      enabled: false,
      revision: 3,
    });
    jest.mocked(deps.repository.findOwned).mockResolvedValue(current);
    jest
      .mocked(deps.repository.updateSecurityBoundaryIfRevision)
      .mockResolvedValue(updated);
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    await service.update(context, current.id, {
      expectedRevision: 2,
      endpoint: 'https://new.example.com/mcp',
      enabled: true,
    });

    expect(
      deps.repository.updateSecurityBoundaryIfRevision,
    ).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      current.id,
      2,
      expect.objectContaining({
        endpoint: 'https://new.example.com/mcp',
        enabled: false,
      }),
    );
    expect(deps.repository.updateIfRevision).not.toHaveBeenCalled();
  });

  test('credential 없는 bearer connection은 enable하지 않는다', async () => {
    const deps = dependencies();
    const current = connection();
    jest.mocked(deps.repository.findOwned).mockResolvedValue(current);
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    await expect(
      service.update(context, current.id, {
        expectedRevision: current.revision,
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(AgentMcpConnectionCredentialRequiredError);
    expect(deps.repository.updateIfRevision).not.toHaveBeenCalled();
  });

  test('OAuth client 정보만 있고 access token이 없으면 enable하지 않는다', async () => {
    const deps = dependencies();
    const current = connection({ authKind: 'oauth' });
    jest.mocked(deps.repository.findOwned).mockResolvedValue(current);
    jest
      .mocked(deps.repository.findCredentialForOwnedConnection)
      .mockResolvedValue({} as never);
    jest.mocked(deps.oauthCredentials.hasAccessToken).mockResolvedValue(false);
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    await expect(
      service.update(context, current.id, {
        expectedRevision: current.revision,
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(AgentMcpConnectionCredentialRequiredError);
    expect(deps.oauthCredentials.hasAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      current.id,
    );
    expect(deps.repository.updateIfRevision).not.toHaveBeenCalled();
  });

  test('존재하는 connection의 CAS 실패는 revision conflict로 구분한다', async () => {
    const deps = dependencies();
    const current = connection({ authKind: 'none' });
    jest.mocked(deps.repository.findOwned).mockResolvedValue(current);
    jest.mocked(deps.repository.updateIfRevision).mockResolvedValue(null);
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    await expect(
      service.update(context, current.id, {
        expectedRevision: current.revision,
        displayName: 'Changed',
      }),
    ).rejects.toBeInstanceOf(AgentMcpConnectionRevisionConflictError);
  });

  test('tool policy는 mode와 전체 선택 집합을 하나의 revision CAS로 저장한다', async () => {
    const deps = dependencies();
    const current = connection({ authKind: 'none' });
    const updated = connection({
      authKind: 'none',
      toolPolicyMode: 'all',
      revision: current.revision + 1,
    });
    jest.mocked(deps.repository.findOwned).mockResolvedValue(current);
    jest
      .mocked(deps.repository.updateToolPolicyIfRevision)
      .mockResolvedValue(updated);
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );
    const tools = [
      {
        originalToolName: 'search',
        schemaFingerprint: 'a'.repeat(64),
        enabled: true,
      },
    ];

    const result = await service.updateToolPolicy(context, current.id, {
      expectedRevision: current.revision,
      mode: 'all',
      tools,
    });

    expect(deps.repository.updateToolPolicyIfRevision).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      current.id,
      current.revision,
      'all',
      tools,
    );
    expect(result.toolPolicy.mode).toBe('all');
  });

  test('discovery schema fingerprint가 바뀌면 selected 상태를 fail-closed로 표시한다', async () => {
    const deps = dependencies();
    const current = connection({
      authKind: 'none',
      toolPolicyMode: 'selected',
    });
    jest.mocked(deps.repository.findOwned).mockResolvedValue(current);
    jest.mocked(deps.repository.listEnabledTools).mockResolvedValue([
      {
        originalToolName: 'search',
        schemaFingerprint: 'b'.repeat(64),
        enabled: true,
      },
    ] as never);
    deps.discovery.discover.mockResolvedValue({
      serverName: 'Fixture MCP',
      serverVersion: '1.0.0',
      tools: [
        {
          name: 'search',
          description: '검색',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
          },
          annotations: { readOnlyHint: true },
        },
      ],
    });
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    const result = await service.discoverTools(context, current.id);

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      originalToolName: 'search',
      selected: false,
      schemaChanged: true,
      annotations: { readOnlyHint: true },
    });
    expect(result.tools[0]?.schemaFingerprint).not.toBe('b'.repeat(64));
  });

  test('원격 discovery 오류 세부내용을 API 오류 메시지로 노출하지 않는다', async () => {
    const deps = dependencies();
    const current = connection({ authKind: 'none' });
    jest.mocked(deps.repository.findOwned).mockResolvedValue(current);
    deps.discovery.discover.mockRejectedValue(
      new Error('remote-secret-token=do-not-leak'),
    );
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    let caught: unknown;
    try {
      await service.testConnection(context, current.id);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AgentMcpDiscoveryFailedError);
    expect((caught as Error).message).not.toContain('remote-secret-token');
    expect(deps.repository.recordHealth).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      current.id,
      expect.any(Date),
      'discovery_failed',
    );
  });

  test('network discovery 실패는 unavailable health로 기록한다', async () => {
    const deps = dependencies();
    const current = connection({ authKind: 'none', enabled: true });
    jest.mocked(deps.repository.findOwned).mockResolvedValue(current);
    deps.discovery.discover.mockRejectedValue(new TypeError('fetch failed'));
    const service = new AgentMcpConnectionsService(
      deps.repository,
      deps.credentials,
      deps.oauthCredentials,
      deps.oauth,
      deps.discovery,
      deps.organizations,
      deps.configService,
    );

    await expect(
      service.testConnection(context, current.id),
    ).rejects.toBeInstanceOf(AgentMcpDiscoveryFailedError);
    expect(deps.repository.recordHealth).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      current.id,
      expect.any(Date),
      'connection_unavailable',
    );
  });
});
