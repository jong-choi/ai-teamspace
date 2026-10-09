import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import type { AgentMcpCredentialService } from '@/agent-mcp-connections/application/agent-mcp-credential.service';
import type { AgentMcpOauthService } from '@/agent-mcp-connections/application/agent-mcp-oauth.service';
import { ExternalMcpToolPolicy } from '@/agent-mcp-connections/application/external-mcp-tool.policy';
import { AgentMcpConnectionSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import type { SafeOutboundHttp } from '@/agent-mcp-connections/infrastructure/http/safe-outbound-http';
import { McpSdkExternalMcpConnectionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/mcp-sdk-external-mcp-connection.adapter';
import type { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';

import { Client } from '@modelcontextprotocol/client';
import { startWorkOsMcpFixture } from '@test/agent/fixtures/workos-mcp.fixture';
import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

describe('external MCP SDK connection adapter', () => {
  const actor: AgentActor = {
    userId: 'user-a',
    organizationId: 'organization-a',
    permissions: [],
  };

  function connection() {
    return AgentMcpConnectionSchema.parse({
      id: '0199d54e-282e-7adf-8000-000000000001',
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      displayName: 'Fixture MCP',
      namespace: 'extfixture1',
      endpoint: 'https://fixture.invalid/mcp',
      transport: 'http',
      authKind: 'bearer',
      enabled: true,
      toolPolicyMode: 'all',
      lastTestedAt: null,
      lastErrorCategory: null,
      revision: 0,
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
      updatedAt: new Date('2026-10-07T00:00:00.000Z'),
    });
  }

  function configService() {
    return {
      getOrThrow: jest.fn().mockReturnValue({
        oauthCallbackUrl: 'http://localhost:3100/agent/mcp/oauth/callback',
        connectTimeoutMs: 2_000,
        toolTimeoutMs: 10_000,
        maxResponseBytes: 1_048_576,
        maxToolsPerConnection: 100,
        maxConnectionsPerUser: 10,
        allowPrivateNetworks: true,
      }),
    } as unknown as ConfigService<AllConfigType>;
  }

  function repository() {
    return {
      listEnabledTools: jest.fn().mockResolvedValue([]),
    } as unknown as AgentMcpConnectionRepository;
  }

  function credentials() {
    return {
      getBearerToken: jest.fn().mockResolvedValue('fixture:user-a'),
    } as unknown as AgentMcpCredentialService;
  }

  function oauth() {
    return {
      createRuntimeAuthProvider: jest.fn(),
    } as unknown as AgentMcpOauthService;
  }

  test('교체 전 bearer 검증은 persisted credential을 읽지 않고 ephemeral token만 사용한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const safeOutboundFetchMock = jest.fn(
      (input: string | URL, init?: RequestInit) =>
        fetch(input, { ...init, redirect: 'manual' }),
    );
    const safeOutbound = {
      assertSafe: jest.fn().mockResolvedValue(new URL(fixture.url)),
      fetch: safeOutboundFetchMock,
    } as unknown as SafeOutboundHttp;
    const persistedCredentialsGetBearerTokenMock = jest
      .fn()
      .mockRejectedValue(new Error('persisted credential을 읽으면 안 됩니다.'));
    const persistedCredentials = {
      getBearerToken: persistedCredentialsGetBearerTokenMock,
    } as unknown as AgentMcpCredentialService;
    const adapter = new McpSdkExternalMcpConnectionAdapter(
      repository(),
      persistedCredentials,
      oauth(),
      safeOutbound,
      new ExternalMcpToolPolicy(),
      configService(),
    );

    try {
      const discovery = await adapter.discoverWithBearerToken(
        actor,
        connection(),
        'fixture:user-a',
      );

      expect(discovery.tools.map((tool) => tool.name)).toContain(
        'fixture_read',
      );
      expect(persistedCredentialsGetBearerTokenMock).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  });

  test('modern MCP를 연결하고 external tool을 모두 HITL 대상으로 노출한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const safeOutboundFetchMock = jest.fn(
      (input: string | URL, init?: RequestInit) =>
        fetch(input, { ...init, redirect: 'manual' }),
    );
    const safeOutbound = {
      assertSafe: jest.fn().mockResolvedValue(new URL(fixture.url)),
      fetch: safeOutboundFetchMock,
    } as unknown as SafeOutboundHttp;
    const adapter = new McpSdkExternalMcpConnectionAdapter(
      repository(),
      credentials(),
      oauth(),
      safeOutbound,
      new ExternalMcpToolPolicy(),
      configService(),
    );

    try {
      const session = await adapter.open(actor, connection());
      try {
        const read = session.tools.find(
          (tool) => tool.name === 'extfixture1__fixture_read',
        );
        if (!read) {
          throw new Error('external fixture read tool이 없습니다.');
        }

        await expect(read.invoke({ query: 'alpha' })).resolves.toBe(
          'read:user-a:alpha',
        );
        expect(session.readOnlyTools).toEqual([]);
        expect(session.interruptOn[read.name]).toBe(true);
        expect(session.toolIdentities.get(read.name)).toMatchObject({
          source: 'external',
          connectionId: connection().id,
          namespace: 'extfixture1',
          originalToolName: 'fixture_read',
        });
        expect(fixture.state.reads).toContainEqual({
          actor: 'user-a',
          query: 'alpha',
        });
      } finally {
        await session.close();
        await session.close();
      }
    } finally {
      await fixture.close();
    }
  });

  test('discovery는 policy filter 전 원본 tool catalog를 bounded timeout으로 반환한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const listTools = jest.spyOn(Client.prototype, 'listTools');
    const safeOutboundFetchMock = jest.fn(
      (input: string | URL, init?: RequestInit) =>
        fetch(input, { ...init, redirect: 'manual' }),
    );
    const safeOutbound = {
      assertSafe: jest.fn().mockResolvedValue(new URL(fixture.url)),
      fetch: safeOutboundFetchMock,
    } as unknown as SafeOutboundHttp;
    const adapter = new McpSdkExternalMcpConnectionAdapter(
      repository(),
      credentials(),
      oauth(),
      safeOutbound,
      new ExternalMcpToolPolicy(),
      configService(),
    );

    try {
      const catalog = await adapter.discover(actor, connection());

      expect(catalog.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['fixture_read', 'fixture_wait']),
      );
      expect(
        catalog.tools.some((tool) => tool.name.startsWith('extfixture1__')),
      ).toBe(false);
      expect(listTools).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          timeout: 2_000,
          maxTotalTimeout: 2_000,
        }),
      );
    } finally {
      listTools.mockRestore();
      await fixture.close();
    }
  });

  test('tool AbortSignal을 실제 MCP request까지 전파한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const safeOutboundFetchMock = jest.fn(
      (input: string | URL, init?: RequestInit) =>
        fetch(input, { ...init, redirect: 'manual' }),
    );
    const safeOutbound = {
      assertSafe: jest.fn().mockResolvedValue(new URL(fixture.url)),
      fetch: safeOutboundFetchMock,
    } as unknown as SafeOutboundHttp;
    const adapter = new McpSdkExternalMcpConnectionAdapter(
      repository(),
      credentials(),
      oauth(),
      safeOutbound,
      new ExternalMcpToolPolicy(),
      configService(),
    );

    try {
      const session = await adapter.open(actor, connection());
      try {
        const wait = session.tools.find(
          (tool) => tool.name === 'extfixture1__fixture_wait',
        );
        if (!wait) {
          throw new Error('external fixture wait tool이 없습니다.');
        }

        const controller = new AbortController();
        const invocation = wait.invoke(
          { milliseconds: 5_000 },
          { signal: controller.signal },
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        controller.abort();

        await expect(invocation).rejects.toThrow();
        await waitForCondition(
          () => fixture.state.waits.some((entry) => entry.cancelled),
          'external MCP AbortSignal이 server까지 전달되지 않았습니다.',
          { timeoutMs: 2_000 },
        );
      } finally {
        await session.close();
      }
    } finally {
      await fixture.close();
    }
  });

  test('MCP endpoint redirect를 자동 추적하지 않고 credential을 다른 origin에 전달하지 않는다', async () => {
    let redirectedHits = 0;
    let redirectedAuthorization: string | undefined;
    const redirectedServer = createServer((request, response) => {
      redirectedHits += 1;
      redirectedAuthorization = request.headers.authorization;
      response.statusCode = 200;
      response.end();
    });
    redirectedServer.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      redirectedServer.once('listening', resolve);
      redirectedServer.once('error', reject);
    });
    const redirectedAddress = redirectedServer.address() as AddressInfo;
    const redirectedUrl = new URL(
      `http://127.0.0.1:${redirectedAddress.port}/mcp`,
    );

    let endpointAuthorization: string | undefined;
    const redirectServer = createServer((request, response) => {
      endpointAuthorization = request.headers.authorization;
      response.statusCode = 302;
      response.setHeader('location', redirectedUrl.toString());
      response.end();
    });
    redirectServer.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      redirectServer.once('listening', resolve);
      redirectServer.once('error', reject);
    });
    const address = redirectServer.address() as AddressInfo;
    const redirectUrl = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const safeOutboundFetchMock = jest.fn(
      (input: string | URL, init?: RequestInit) =>
        fetch(input, { ...init, redirect: 'manual' }),
    );
    const safeOutbound = {
      assertSafe: jest.fn().mockResolvedValue(redirectUrl),
      fetch: safeOutboundFetchMock,
    } as unknown as SafeOutboundHttp;
    const adapter = new McpSdkExternalMcpConnectionAdapter(
      repository(),
      credentials(),
      oauth(),
      safeOutbound,
      new ExternalMcpToolPolicy(),
      configService(),
    );

    try {
      await expect(adapter.open(actor, connection())).rejects.toThrow();
      expect(safeOutboundFetchMock).toHaveBeenCalled();
      expect(endpointAuthorization).toBe('Bearer fixture:user-a');
      expect(redirectedHits).toBe(0);
      expect(redirectedAuthorization).toBeUndefined();
    } finally {
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          redirectServer.close((error) => (error ? reject(error) : resolve()));
        }),
        new Promise<void>((resolve, reject) => {
          redirectedServer.close((error) =>
            error ? reject(error) : resolve(),
          );
        }),
      ]);
    }
  });
});
