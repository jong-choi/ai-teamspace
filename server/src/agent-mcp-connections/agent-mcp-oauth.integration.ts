import { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import { AgentMcpOauthStateService } from '@/agent-mcp-connections/application/agent-mcp-oauth-state.service';
import { McpSdkExternalMcpConnectionAdapter } from '@/agent-mcp-connections/infrastructure/mcp/mcp-sdk-external-mcp-connection.adapter';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
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

  async function connectOauth(actor: McpActor) {
    const domainActor = toAgentActor(actor);
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
    return { connectionId, code, state, response: callback.body };
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
