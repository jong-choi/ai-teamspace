import type { AgentActor } from '@/agent/domain/agent-actor';
import {
  oauthClient,
  oauthClientResource,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import type { McpScope } from '@/mcp/contracts/mcp-scope';
import { mcpAgentDelegation } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-delegation.schema';
import { mcpAgentOauthFlow } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-oauth-flow.schema';
import { McpAgentDelegationCredentialService } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import { McpAgentDelegationWorkOsAuthProviderFactory } from '@/mcp-agent-delegations/mcp-agent-delegation-workos-auth-provider.factory';

import type { FetchLike } from '@modelcontextprotocol/client';
import { McpIntegrationApp } from '@test/support/mcp-integration.fixture';
import { eq } from 'drizzle-orm';

const WIKI_SCOPES: readonly McpScope[] = ['wiki:read', 'wiki:write'];
const WIKI_TOOLS = [
  'wiki_search',
  'wiki_document_get',
  'wiki_document_create',
  'wiki_document_update',
];

describe('실제 Agent OAuth delegation 통합', () => {
  let target: McpIntegrationApp;
  let credentials: McpAgentDelegationCredentialService;
  let authProviders: McpAgentDelegationWorkOsAuthProviderFactory;

  beforeAll(async () => {
    target = await McpIntegrationApp.start();
    credentials = target.app.get(McpAgentDelegationCredentialService);
    authProviders = target.app.get(McpAgentDelegationWorkOsAuthProviderFactory);
  });

  afterEach(async () => {
    await target.cleanupActors();
  });

  afterAll(async () => {
    await target.close();
  });

  it('callback 뒤 delegation token으로 Work OS MCP 도구를 조회하고 응답에 token을 노출하지 않는다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });

    const callback = await target.completeAgentDelegation(actor);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain('/settings/mcp/consent');
    const status = await actor.agent.get('/mcp/agent-delegation');
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ status: 'active' });
    expect(status.body.grantedScopes).toEqual(
      expect.arrayContaining(WIKI_SCOPES),
    );

    const tokens = await credentials.tokens(actor);
    if (!tokens?.refresh_token) throw new Error('refresh token이 없습니다.');
    const exposed = JSON.stringify([status.body, callback.headers]);
    expect(exposed).not.toContain(tokens.access_token);
    expect(exposed).not.toContain(tokens.refresh_token);

    const mcp = await connectAsAgent(actor);
    try {
      const tools = await mcp.client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(WIKI_TOOLS),
      );
      const wiki = await mcp.client.callTool({
        name: 'wiki_search',
        arguments: { organizationId: actor.organizationId, q: 'MCP' },
      });
      expect(wiki.isError).not.toBe(true);
      // delegation token은 전체 scope를 갖지만 조직/개인 policy 밖 도구는 호출 시점에 거부한다.
      const chat = await mcp.client.callTool({
        name: 'chat_conversations_list',
        arguments: { organizationId: actor.organizationId },
      });
      expect(chat.isError).toBe(true);
    } finally {
      await mcp.close();
    }
  });

  it('같은 callback은 동시 요청과 재전송 중 한 번만 성공한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const callbackUrl = await target.authorizeAgentDelegation(actor);
    const callbackPath = callbackUrl.pathname + callbackUrl.search;

    const concurrent = await Promise.all([
      actor.agent.get(callbackPath),
      actor.agent.get(callbackPath),
    ]);
    const replay = await actor.agent.get(callbackPath);

    expect(concurrent.map((response) => response.status).sort()).toEqual([
      302, 400,
    ]);
    expect(replay.status).toBe(400);
    expect(replay.body).toMatchObject({
      errorCode: 'MCP_AGENT_DELEGATION_FLOW_INVALID',
    });
    const status = await actor.agent.get('/mcp/agent-delegation');
    expect(status.body).toMatchObject({ status: 'active' });
  });

  it('만료된 state의 callback은 거부하고 delegation을 만들지 않는다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const callbackUrl = await target.authorizeAgentDelegation(actor);
    // 실제 flow TTL을 기다리지 않도록 이 actor의 flow 생성·만료 시각을 과거로 옮긴다.
    await target.database
      .update(mcpAgentOauthFlow)
      .set({
        createdAt: new Date(Date.now() - 2_000),
        expiresAt: new Date(Date.now() - 1_000),
      })
      .where(eq(mcpAgentOauthFlow.userId, actor.userId));

    const callback = await actor.agent.get(
      callbackUrl.pathname + callbackUrl.search,
    );

    expect(callback.status).toBe(400);
    expect(callback.body).toMatchObject({
      errorCode: 'MCP_AGENT_DELEGATION_FLOW_INVALID',
    });
    await expect(credentials.latest(actor)).resolves.toBeNull();
  });

  it('delegation과 flow row에 평문 token과 state를 저장하지 않는다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const callbackUrl = await target.authorizeAgentDelegation(actor);
    const state = callbackUrl.searchParams.get('state');
    if (!state) throw new Error('callback URL에 state가 없습니다.');
    const callback = await actor.agent.get(
      callbackUrl.pathname + callbackUrl.search,
    );
    expect(callback.status).toBe(302);
    const tokens = await credentials.tokens(actor);
    if (!tokens?.refresh_token) throw new Error('refresh token이 없습니다.');

    const stored = JSON.stringify([
      await target.database
        .select()
        .from(mcpAgentDelegation)
        .where(eq(mcpAgentDelegation.userId, actor.userId)),
      await target.database
        .select()
        .from(mcpAgentOauthFlow)
        .where(eq(mcpAgentOauthFlow.userId, actor.userId)),
    ]);

    expect(stored).not.toContain(tokens.access_token);
    expect(stored).not.toContain(tokens.refresh_token);
    expect(stored).not.toContain(state);
  });

  it('만료된 access token을 두 Agent session이 동시에 갱신해도 token endpoint는 한 번만 호출한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    expect((await target.completeAgentDelegation(actor)).status).toBe(302);
    const tokens = await credentials.tokens(actor);
    if (!tokens?.issuer) throw new Error('저장된 token issuer가 없습니다.');
    // refresh token은 유지하고 access token만 서버가 거부하는 값으로 바꿔 401 → refresh 경로를 만든다.
    await credentials.saveTokens(
      actor,
      { ...tokens, access_token: 'rejected-access-token' },
      tokens.issuer,
    );

    let tokenRequests = 0;
    const countingFetch: FetchLike = (url, init) => {
      if (new URL(url).pathname === '/api/auth/oauth2/token') {
        tokenRequests += 1;
      }
      return fetch(url, init);
    };
    const sessions = await Promise.all(
      ['agent-a', 'agent-b'].map((name) =>
        connectAsAgent(actor, { name, fetch: countingFetch }),
      ),
    );

    try {
      for (const session of sessions) {
        const tools = await session.client.listTools();
        expect(tools.tools.map((tool) => tool.name)).toEqual(
          expect.arrayContaining(WIKI_TOOLS),
        );
      }
    } finally {
      await Promise.all(sessions.map((session) => session.close()));
    }
    expect(tokenRequests).toBe(1);
    const refreshed = await credentials.tokens(actor);
    expect(refreshed?.access_token).toBeDefined();
    expect(refreshed?.access_token).not.toBe('rejected-access-token');
  });

  it('revoke는 원격 refresh token과 local credential을 폐기하고 같은 user의 다른 조직 delegation은 유지한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    expect((await target.completeAgentDelegation(actor)).status).toBe(302);
    const revokedTokens = await credentials.tokens(actor);
    if (!revokedTokens?.refresh_token) {
      throw new Error('refresh token이 없습니다.');
    }
    const { organizationId: otherOrganizationId } =
      await target.addOrganization(actor, { scopes: WIKI_SCOPES });
    expect((await target.completeAgentDelegation(actor)).status).toBe(302);
    await actor.agent
      .put('/organizations/active')
      .send({ organizationId: actor.organizationId })
      .expect(200);

    await actor.agent.delete('/mcp/agent-delegation').expect(204);

    const status = await actor.agent.get('/mcp/agent-delegation');
    expect(status.body.status).not.toBe('active');
    await expect(credentials.tokens(actor)).resolves.toBeUndefined();
    const refresh = await requestRefreshToken(revokedTokens.refresh_token);
    expect(refresh.status).toBe(400);
    await expect(connectAsAgent(actor)).rejects.toThrow();

    const otherActor = { ...actor, organizationId: otherOrganizationId };
    const other = await connectAsAgent(otherActor);
    try {
      const wiki = await other.client.callTool({
        name: 'wiki_search',
        arguments: { organizationId: otherOrganizationId, q: 'MCP' },
      });
      expect(wiki.isError).not.toBe(true);
    } finally {
      await other.close();
    }
  });

  it('callback 전에 membership이 제거되면 delegation을 만들지 않는다', async () => {
    const owner = await target.createActor({ scopes: WIKI_SCOPES });
    const member = await target.addMember(owner, { scopes: WIKI_SCOPES });
    const callbackUrl = await target.authorizeAgentDelegation(member);

    await owner.agent
      .delete(
        `/organizations/${owner.organizationId}/members/${member.memberId}`,
      )
      .expect(204);
    const callback = await member.agent.get(
      callbackUrl.pathname + callbackUrl.search,
    );

    expect(callback.status).toBeGreaterThanOrEqual(400);
    await expect(credentials.latest(member)).resolves.toBeNull();
  });

  it('active delegation도 membership이 제거되면 다음 도구 호출부터 거부한다', async () => {
    const owner = await target.createActor({ scopes: WIKI_SCOPES });
    const member = await target.addMember(owner, { scopes: WIKI_SCOPES });
    expect((await target.completeAgentDelegation(member)).status).toBe(302);
    const mcp = await connectAsAgent(member);

    try {
      const before = await mcp.client.callTool({
        name: 'wiki_search',
        arguments: { organizationId: member.organizationId, q: 'MCP' },
      });
      expect(before.isError).not.toBe(true);

      await owner.agent
        .delete(
          `/organizations/${owner.organizationId}/members/${member.memberId}`,
        )
        .expect(204);

      const after = await mcp.client.callTool({
        name: 'wiki_search',
        arguments: { organizationId: member.organizationId, q: 'MCP' },
      });
      expect(after.isError).toBe(true);
    } finally {
      await mcp.close();
    }
  });

  it('first-party client row가 없을 때 동시 authorize가 client와 resource link를 하나씩만 만든다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const start = await actor.agent
      .post('/mcp/agent-delegation/start')
      .send({ returnTo: '/ai' });
    expect(start.status).toBe(201);
    const authorizationUrl = new URL(start.body.authorizationUrl);
    const clientId = authorizationUrl.searchParams.get('client_id');
    if (!clientId) throw new Error('authorization URL에 client_id가 없습니다.');
    await target.database
      .delete(oauthClient)
      .where(eq(oauthClient.clientId, clientId));

    const authorizations = await Promise.all(
      Array.from({ length: 4 }, () =>
        actor.agent.get(authorizationUrl.pathname + authorizationUrl.search),
      ),
    );
    expect(authorizations.map((response) => response.status)).toEqual([
      302, 302, 302, 302,
    ]);

    const clients = await target.database
      .select({ id: oauthClient.id })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId));
    const links = await target.database
      .select({ resourceId: oauthClientResource.resourceId })
      .from(oauthClientResource)
      .where(eq(oauthClientResource.clientId, clientId));
    expect(clients).toHaveLength(1);
    expect(links).toEqual([{ resourceId: target.resourceUrl }]);
  });

  function connectAsAgent(
    actor: Pick<AgentActor, 'userId' | 'organizationId'>,
    options: { name?: string; fetch?: FetchLike } = {},
  ) {
    return target.connectClient({
      name: options.name ?? 'work-os-agent',
      authProvider: authProviders.create({ ...actor, permissions: [] }),
      fetch: options.fetch,
    });
  }

  /** 폐기 여부를 확인하려고 first-party client 자격으로 refresh grant를 직접 요청한다. */
  function requestRefreshToken(refreshToken: string): Promise<Response> {
    const { clientId, clientSecret } = target.mcpConfig.agentDelegation;
    return fetch(`${target.baseUrl}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        resource: target.resourceUrl,
      }),
    });
  }
});
