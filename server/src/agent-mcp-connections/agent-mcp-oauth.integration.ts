import { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import { AgentMcpOauthStateService } from '@/agent-mcp-connections/application/agent-mcp-oauth-state.service';
import { AgentMcpToolCatalogSchema } from '@/agent-mcp-connections/dto/agent-mcp-discovery.dto';
import { McpSdkExternalMcpConnectionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/mcp-sdk-external-mcp-connection.adapter';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import { agentMcpConnectionTool } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection-tool.schema';
import { agentMcpCredential } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-credential.schema';
import { agentMcpOauthState } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-oauth-state.schema';
import type { McpScope } from '@/mcp/contracts/mcp-scope';

import {
  type StartedExternalOauthMcpFixture,
  startExternalOauthMcpFixture,
} from '@test/agent/fixtures/external-oauth-mcp.fixture';
import {
  type LoopbackTlsCertificate,
  trustLoopbackTlsCertificate,
} from '@test/support/loopback-tls';
import {
  type McpActor,
  McpIntegrationApp,
} from '@test/support/mcp-integration.fixture';
import { eq } from 'drizzle-orm';

const SCOPES: readonly McpScope[] = ['wiki:read'];

describe('외부 MCP OAuth product 통합', () => {
  let tls: LoopbackTlsCertificate;
  let externalMcp: StartedExternalOauthMcpFixture;
  let target: McpIntegrationApp;
  let credentials: AgentMcpOauthCredentialService;
  let oauthStates: AgentMcpOauthStateService;
  let connections: AgentMcpConnectionRepository;
  let sessions: McpSdkExternalMcpConnectionAdapter;

  beforeAll(async () => {
    tls = await trustLoopbackTlsCertificate();
    externalMcp = await startExternalOauthMcpFixture({ tls });
    target = await McpIntegrationApp.start({
      environment: { AGENT_EXTERNAL_MCP_ALLOW_PRIVATE_NETWORKS: 'true' },
    });
    credentials = target.app.get(AgentMcpOauthCredentialService);
    oauthStates = target.app.get(AgentMcpOauthStateService);
    connections = target.app.get(AgentMcpConnectionRepository);
    sessions = target.app.get(McpSdkExternalMcpConnectionAdapter);
  });

  afterEach(async () => {
    await target.cleanupActors();
  });

  afterAll(async () => {
    await target.close();
    await externalMcp.close();
    tls.restoreTrust();
  });

  it('OA-1 DCR과 PKCE callback 뒤 실제 도구를 조회하고 secret을 평문 저장하지 않는다', async () => {
    const actor = await target.createActor({ scopes: SCOPES });
    const connected = await connectOauth(actor);

    const tools = await actor.agent
      .get(`/agent/mcp-connections/${connected.connectionId}/tools`)
      .expect(200);
    expect(JSON.stringify(tools.body)).toContain('oauth_fixture_read');
    expect(externalMcp.state.registrationRequests).toBeGreaterThan(0);

    const tokens = await credentials.tokens(
      toAgentActor(actor),
      connected.connectionId,
    );
    if (!tokens?.refresh_token) throw new Error('OAuth token이 없습니다.');
    const stored = JSON.stringify([
      await target.database
        .select()
        .from(agentMcpCredential)
        .where(eq(agentMcpCredential.connectionId, connected.connectionId)),
      await target.database
        .select()
        .from(agentMcpOauthState)
        .where(eq(agentMcpOauthState.connectionId, connected.connectionId)),
    ]);
    for (const secret of [
      tokens.access_token,
      tokens.refresh_token,
      connected.code,
      connected.state,
    ]) {
      expect(stored.includes(secret)).toBe(false);
      expect(JSON.stringify(connected.response).includes(secret)).toBe(false);
    }
  });

  it('OA-2 runtime session이 OAuth bearer로 외부 도구를 실제 호출한다', async () => {
    const actor = await target.createActor({ scopes: SCOPES });
    const connected = await connectOauth(actor);
    const policy = await actor.agent
      .patch(`/agent/mcp-connections/${connected.connectionId}/tool-policy`)
      .send({
        mode: 'all',
        tools: [],
        expectedRevision: connected.response.revision,
      })
      .expect(200);
    const connection = await connections.findOwned(
      actor.userId,
      actor.organizationId,
      connected.connectionId,
    );
    if (!connection) throw new Error('OAuth 연결을 찾지 못했습니다.');
    expect(connection.revision).toBe(policy.body.revision);

    const session = await sessions.open(
      {
        userId: actor.userId,
        organizationId: actor.organizationId,
        permissions: [],
      },
      connection,
    );
    try {
      const tool = session.tools.find(
        (candidate) =>
          session.toolIdentities.get(candidate.name)?.originalToolName ===
          'oauth_fixture_read',
      );
      if (!tool) throw new Error('OAuth fixture 도구를 찾지 못했습니다.');
      await tool.invoke({ query: 'runtime-oauth' });
    } finally {
      await session.close();
    }
    expect(externalMcp.state.toolCalls.at(-1)?.query).toBe('runtime-oauth');
  });

  it('OA-3 access token을 거부하면 refresh token을 rotation하고 요청을 재시도한다', async () => {
    const actor = await target.createActor({ scopes: SCOPES });
    const connected = await connectOauth(actor);
    const before = await credentials.tokens(
      toAgentActor(actor),
      connected.connectionId,
    );
    if (!before?.refresh_token) throw new Error('OAuth token이 없습니다.');
    const refreshRequestsBefore = externalMcp.state.refreshRequests;
    externalMcp.invalidateAccessToken(before.access_token);

    await actor.agent
      .get(`/agent/mcp-connections/${connected.connectionId}/tools`)
      .expect(200);

    const after = await credentials.tokens(
      toAgentActor(actor),
      connected.connectionId,
    );
    expect(after?.access_token).not.toBe(before.access_token);
    expect(after?.refresh_token).not.toBe(before.refresh_token);
    expect(externalMcp.state.refreshRequests - refreshRequestsBefore).toBe(1);
  });

  it('OA-4 동시 401은 refresh lease로 token endpoint를 한 번만 호출한다', async () => {
    const actor = await target.createActor({ scopes: SCOPES });
    const connected = await connectOauth(actor);
    const before = await credentials.tokens(
      toAgentActor(actor),
      connected.connectionId,
    );
    if (!before?.refresh_token) throw new Error('OAuth token이 없습니다.');
    const refreshRequestsBefore = externalMcp.state.refreshRequests;
    externalMcp.invalidateAccessToken(before.access_token);

    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        actor.agent.get(
          `/agent/mcp-connections/${connected.connectionId}/tools`,
        ),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 200,
    ]);
    expect(externalMcp.state.refreshRequests - refreshRequestsBefore).toBe(1);
  });

  it('OA-5 user·state·connection binding과 callback 단회 소비를 강제한다', async () => {
    const actor = await target.createActor({ scopes: SCOPES });
    const stranger = await target.createActor({ scopes: SCOPES });

    const foreign = await beginOauth(actor);
    await stranger.agent
      .get(foreign.callbackUrl.pathname + foreign.callbackUrl.search)
      .expect(400);
    await expect(
      credentials.tokens(toAgentActor(actor), foreign.connectionId),
    ).resolves.toBeUndefined();
    await finishOauth(actor, foreign);

    const tampered = await beginOauth(actor);
    const tamperedUrl = new URL(tampered.callbackUrl);
    tamperedUrl.searchParams.set('state', `${tampered.state}-tampered`);
    await actor.agent
      .get(tamperedUrl.pathname + tamperedUrl.search)
      .expect(400);
    await expect(
      credentials.tokens(toAgentActor(actor), tampered.connectionId),
    ).resolves.toBeUndefined();
    await finishOauth(actor, tampered);

    const replayed = await beginOauth(actor);
    await finishOauth(actor, replayed);
    await actor.agent
      .get(replayed.callbackUrl.pathname + replayed.callbackUrl.search)
      .expect(400);

    const first = await beginOauth(actor);
    const second = await beginOauth(actor);
    const mixed = new URL(first.callbackUrl);
    mixed.searchParams.set('state', second.state);
    await actor.agent.get(mixed.pathname + mixed.search).expect(400);
    await expect(
      credentials.tokens(toAgentActor(actor), first.connectionId),
    ).resolves.toBeUndefined();
    await expect(
      credentials.tokens(toAgentActor(actor), second.connectionId),
    ).resolves.toBeUndefined();
    await finishOauth(actor, first);
    await finishOauth(actor, second);
  });

  it('OA-6 refresh token도 폐기되면 typed 실패와 health를 남기고 secret을 노출하지 않는다', async () => {
    const actor = await target.createActor({ scopes: SCOPES });
    const connected = await connectOauth(actor);
    const tokens = await credentials.tokens(
      toAgentActor(actor),
      connected.connectionId,
    );
    if (!tokens?.refresh_token) throw new Error('OAuth token이 없습니다.');
    externalMcp.invalidateAccessToken(tokens.access_token);
    externalMcp.revokeRefreshToken(tokens.refresh_token);

    const rejected = await actor.agent.get(
      `/agent/mcp-connections/${connected.connectionId}/tools`,
    );

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.body).toMatchObject({
      errorCode: 'AGENT_MCP_DISCOVERY_FAILED',
    });
    expect(JSON.stringify(rejected.body).includes(tokens.access_token)).toBe(
      false,
    );
    expect(JSON.stringify(rejected.body).includes(tokens.refresh_token)).toBe(
      false,
    );
    const detail = await actor.agent
      .get(`/agent/mcp-connections/${connected.connectionId}`)
      .expect(200);
    expect(detail.body.lastErrorCategory).toBe('authorization_required');
  });

  it('OA-7 삭제는 credential·state·tool row를 cascade 정리한다', async () => {
    const actor = await target.createActor({ scopes: SCOPES });
    const connected = await connectOauth(actor);
    const catalog = await actor.agent
      .get(`/agent/mcp-connections/${connected.connectionId}/tools`)
      .expect(200);
    const discoveredTools = AgentMcpToolCatalogSchema.parse(catalog.body).tools;
    const latest = await actor.agent
      .get(`/agent/mcp-connections/${connected.connectionId}`)
      .expect(200);
    await actor.agent
      .patch(`/agent/mcp-connections/${connected.connectionId}/tool-policy`)
      .send({
        mode: 'selected',
        tools: discoveredTools.map((tool) => ({
          originalToolName: tool.originalToolName,
          schemaFingerprint: tool.schemaFingerprint,
          enabled: true,
        })),
        expectedRevision: latest.body.revision,
      })
      .expect(200);
    expect(
      await target.database
        .select({ id: agentMcpConnectionTool.id })
        .from(agentMcpConnectionTool)
        .where(eq(agentMcpConnectionTool.connectionId, connected.connectionId)),
    ).not.toHaveLength(0);
    const beforeDelete = await actor.agent
      .get(`/agent/mcp-connections/${connected.connectionId}`)
      .expect(200);
    const revocationsBefore = externalMcp.state.revocationRequests;

    await actor.agent
      .delete(`/agent/mcp-connections/${connected.connectionId}`)
      .query({ expectedRevision: beforeDelete.body.revision })
      .expect(204);

    await expect(
      target.database
        .select({ connectionId: agentMcpCredential.connectionId })
        .from(agentMcpCredential)
        .where(eq(agentMcpCredential.connectionId, connected.connectionId)),
    ).resolves.toEqual([]);
    await expect(
      target.database
        .select({ stateHash: agentMcpOauthState.stateHash })
        .from(agentMcpOauthState)
        .where(eq(agentMcpOauthState.connectionId, connected.connectionId)),
    ).resolves.toEqual([]);
    await expect(
      target.database
        .select({ id: agentMcpConnectionTool.id })
        .from(agentMcpConnectionTool)
        .where(eq(agentMcpConnectionTool.connectionId, connected.connectionId)),
    ).resolves.toEqual([]);
    expect(externalMcp.state.revocationRequests).toBe(revocationsBefore);
  });

  async function connectOauth(actor: McpActor) {
    const pending = await beginOauth(actor);
    const response = await finishOauth(actor, pending);
    return { ...pending, response };
  }

  async function beginOauth(actor: McpActor) {
    const created = await actor.agent
      .post('/agent/mcp-connections')
      .send({
        displayName: 'External OAuth MCP',
        endpoint: externalMcp.url,
        authKind: 'oauth',
      })
      .expect(201);
    const connectionId: string = created.body.id;
    const started = await actor.agent
      .post(`/agent/mcp-connections/${connectionId}/oauth/start`)
      .expect(201);
    const callbackUrl = await externalMcp.authorize(
      new URL(started.body.authorizationUrl),
    );
    const code = requiredSearchParam(callbackUrl, 'code');
    const state = requiredSearchParam(callbackUrl, 'state');
    return { connectionId, callbackUrl, code, state };
  }

  async function finishOauth(
    actor: McpActor,
    pending: Awaited<ReturnType<typeof beginOauth>>,
  ) {
    const { callbackUrl, connectionId, state } = pending;
    const domainActor = toAgentActor(actor);
    const pendingStates = await target.database
      .select({
        stateHash: agentMcpOauthState.stateHash,
        ownerUserId: agentMcpOauthState.ownerUserId,
        organizationId: agentMcpOauthState.organizationId,
        redirectUri: agentMcpOauthState.redirectUri,
        resourceIdentity: agentMcpOauthState.resourceIdentity,
        consumedAt: agentMcpOauthState.consumedAt,
      })
      .from(agentMcpOauthState)
      .where(eq(agentMcpOauthState.connectionId, connectionId));
    expect(pendingStates).toHaveLength(1);
    expect(pendingStates[0]?.stateHash).toBe(
      createHash('sha256').update(state).digest('hex'),
    );
    expect(pendingStates[0]).toMatchObject({
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      redirectUri: `${target.baseUrl}/agent/mcp-connections/oauth/callback`,
      resourceIdentity: externalMcp.url,
      consumedAt: null,
    });
    await expect(
      oauthStates.codeVerifier(
        domainActor,
        connectionId,
        state,
        `${target.baseUrl}/agent/mcp-connections/oauth/callback`,
      ),
    ).resolves.toEqual(expect.any(String));
    await expect(
      oauthStates.discoveryState(
        domainActor,
        connectionId,
        state,
        `${target.baseUrl}/agent/mcp-connections/oauth/callback`,
      ),
    ).resolves.toMatchObject({ authorizationServerUrl: externalMcp.issuer });
    const callback = await actor.agent.get(
      callbackUrl.pathname + callbackUrl.search,
    );
    if (callback.status !== 200) {
      throw new Error(
        `OAuth callback 실패: ${JSON.stringify({
          status: callback.status,
          errorCode: callback.body.errorCode,
          title: callback.body.title,
          detail: callback.body.detail,
        })}`,
      );
    }
    return callback.body;
  }
});

function requiredSearchParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`OAuth callback URL에 ${name}이 없습니다.`);
  return value;
}

function toAgentActor(actor: McpActor) {
  return {
    userId: actor.userId,
    organizationId: actor.organizationId,
    permissions: [],
  };
}
import { createHash } from 'node:crypto';
