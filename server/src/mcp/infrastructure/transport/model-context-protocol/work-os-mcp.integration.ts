import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';

import {
  account,
  apikey,
  oauthClient,
  oauthClientResource,
  organization,
  session,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import { McpAccessKeyAuthenticator } from '@/mcp-access-keys/mcp-access-key-authenticator.provider';

import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createAppTestingModule } from '@test/support/app-testing-module';
import { eq } from 'drizzle-orm';
import request from 'supertest';

const MODERN_PROTOCOL_VERSION = '2026-07-28';
const email = 'work-os-mcp-integration@example.com';
const organizationSlug = 'work-os-mcp-integration';

describe('실제 Work OS MCP transport 통합', () => {
  let app: INestApplication;
  let database: DatabaseService['db'];
  let baseUrl: string;
  let resourceUrl: string;
  let originalEnvironment: Record<string, string | undefined>;

  beforeAll(async () => {
    const port = await reservePort();
    baseUrl = `http://127.0.0.1:${port}`;
    resourceUrl = `${baseUrl}/mcp`;
    originalEnvironment = Object.fromEntries(
      [
        'BETTER_AUTH_URL',
        'APP_TRUSTED_ORIGINS',
        'MCP_RESOURCE_URL',
        'MCP_ALLOWED_HOSTS',
        'MCP_ALLOWED_ORIGINS',
        'MCP_AGENT_OAUTH_REDIRECT_URL',
      ].map((key) => [key, process.env[key]]),
    );
    process.env.BETTER_AUTH_URL = baseUrl;
    process.env.APP_TRUSTED_ORIGINS = baseUrl;
    process.env.MCP_RESOURCE_URL = resourceUrl;
    process.env.MCP_ALLOWED_HOSTS = '127.0.0.1,localhost';
    process.env.MCP_ALLOWED_ORIGINS = '127.0.0.1,localhost';
    process.env.MCP_AGENT_OAUTH_REDIRECT_URL = `${baseUrl}/mcp/agent-delegation/callback`;

    const moduleFixture = await createAppTestingModule().compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    await app.listen(port, '127.0.0.1');
    database = app.get(DatabaseService).db;
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('actual PAT로 official client가 scope-filtered tools를 조회하고 Wiki write를 영속화한다', async () => {
    const fixture = await createActorAndKey();
    const transport = new StreamableHTTPClientTransport(new URL(resourceUrl), {
      requestInit: {
        headers: { Authorization: `Bearer ${fixture.secret}` },
      },
    });
    const client = createModernClient('work-os-integration');

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        'wiki_search',
        'wiki_document_get',
        'wiki_document_create',
        'wiki_document_update',
      ]);

      const created = await client.callTool({
        name: 'wiki_document_create',
        arguments: {
          organizationId: fixture.organizationId,
          title: 'MCP 통합 문서',
          contentMarkdown: '# actual MCP write',
        },
      });
      expect(created.isError).not.toBe(true);
      const structured = created.structuredContent as { id?: unknown };
      expect(typeof structured.id).toBe('string');

      const authoritative = await fixture.agent.get(
        `/organizations/${fixture.organizationId}/wiki/documents/${String(structured.id)}`,
      );
      expect(authoritative.status).toBe(200);
      expect(authoritative.body).toMatchObject({
        id: structured.id,
        title: 'MCP 통합 문서',
        contentMarkdown: '# actual MCP write',
      });
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    }
  });

  it('tools/list 뒤 user policy를 축소하면 stale write invocation을 call-time에 차단한다', async () => {
    const fixture = await createActorAndKey();
    const transport = new StreamableHTTPClientTransport(new URL(resourceUrl), {
      requestInit: {
        headers: { Authorization: `Bearer ${fixture.secret}` },
      },
    });
    const client = createModernClient('work-os-policy-race');

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain(
        'wiki_document_create',
      );

      const shrink = await fixture.agent
        .patch(`/organizations/${fixture.organizationId}/mcp-access/me`)
        .send({
          requestedScopes: ['wiki:read'],
          expectedRevision: fixture.userPolicyRevision,
        });
      expect(shrink.status).toBe(200);

      const denied = await client.callTool({
        name: 'wiki_document_create',
        arguments: {
          organizationId: fixture.organizationId,
          title: '차단되어야 하는 문서',
        },
      });
      expect(denied.isError).toBe(true);
      expect(JSON.stringify(denied)).not.toContain(fixture.secret);
      const search = await fixture.agent.get(
        `/organizations/${fixture.organizationId}/wiki/search?q=${encodeURIComponent('차단되어야 하는 문서')}`,
      );
      expect(search.status).toBe(200);
      expect(search.body.items).toHaveLength(0);
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    }
  });

  it('PAT revoke 후 같은 secret의 새 MCP connection을 거부한다', async () => {
    const fixture = await createActorAndKey();
    await fixture.agent.delete(`/mcp/access-keys/${fixture.keyId}`).expect(204);

    const transport = new StreamableHTTPClientTransport(new URL(resourceUrl), {
      requestInit: {
        headers: { Authorization: `Bearer ${fixture.secret}` },
      },
    });
    const client = createModernClient('work-os-revoked-key');
    try {
      await expect(client.connect(transport)).rejects.toThrow();
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    }
  });

  it('root OAuth discovery 문서가 MCP resource와 Better Auth issuer를 가리킨다', async () => {
    const http = request(app.getHttpServer());

    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      const resourceMetadata = await http.get(path);
      expect(resourceMetadata.status).toBe(200);
      expect(resourceMetadata.body).toMatchObject({
        resource: resourceUrl,
        authorization_servers: [`${baseUrl}/api/auth`],
      });
    }

    const authorizationMetadata = await http.get(
      '/.well-known/oauth-authorization-server/api/auth',
    );
    expect(authorizationMetadata.status).toBe(200);
    expect(authorizationMetadata.body).toMatchObject({
      issuer: `${baseUrl}/api/auth`,
      authorization_endpoint: `${baseUrl}/api/auth/oauth2/authorize`,
    });

    const head = await http.head('/.well-known/oauth-protected-resource/mcp');
    expect(head.status).toBe(200);
    expect(head.text).toBeUndefined();
  });

  it('first-party client row가 없을 때 동시 authorize가 client와 resource link를 하나씩만 만든다', async () => {
    const fixture = await createActorAndKey();
    const start = await fixture.agent
      .post('/mcp/agent-delegation/start')
      .send({ returnTo: '/ai' });
    expect(start.status).toBe(201);
    const authorizationUrl = new URL(start.body.authorizationUrl as string);
    const clientId = authorizationUrl.searchParams.get('client_id');
    if (!clientId) throw new Error('authorization URL에 client_id가 없습니다.');
    await database
      .delete(oauthClient)
      .where(eq(oauthClient.clientId, clientId));

    const authorizations = await Promise.all(
      Array.from({ length: 4 }, () =>
        fixture.agent.get(authorizationUrl.pathname + authorizationUrl.search),
      ),
    );
    expect(authorizations.map((response) => response.status)).toEqual([
      302, 302, 302, 302,
    ]);

    const clients = await database
      .select({ id: oauthClient.id })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId));
    const links = await database
      .select({ resourceId: oauthClientResource.resourceId })
      .from(oauthClientResource)
      .where(eq(oauthClientResource.clientId, clientId));
    expect(clients).toHaveLength(1);
    expect(links).toEqual([{ resourceId: resourceUrl }]);
  });

  it('잘못된 JSON은 전역 parser가 아니라 MCP transport가 JSON-RPC parse error로 거부한다', async () => {
    const fixture = await createActorAndKey();

    const response = await postRawMcp({
      secret: fixture.secret,
      body: '{"jsonrpc":',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32700 },
    });
  });

  it('MCP 요청 크기 제한은 전역 JSON parser 제한이 아니라 MCP 설정을 따른다', async () => {
    const fixture = await createActorAndKey();
    const maxBytes = Number(process.env.MCP_MAX_REQUEST_BODY_BYTES);
    const listToolsWithPadding = (padding: number) =>
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': MODERN_PROTOCOL_VERSION,
            'io.modelcontextprotocol/clientCapabilities': {},
            padding: 'x'.repeat(padding),
          },
        },
      });

    // 전역 JSON parser 기본 제한(100kb)보다 크고 MCP 제한보다 작은 요청이다.
    const withinMcpLimit = await postRawMcp({
      secret: fixture.secret,
      body: listToolsWithPadding(maxBytes - 1_000),
      mcpMethod: 'tools/list',
    });
    expect(withinMcpLimit.status).toBe(200);

    const overMcpLimit = await postRawMcp({
      secret: fixture.secret,
      body: listToolsWithPadding(maxBytes),
      mcpMethod: 'tools/list',
    });
    expect(overMcpLimit.status).toBe(413);
  });

  async function postRawMcp(input: {
    secret: string;
    body: string;
    mcpMethod?: string;
  }): Promise<Response> {
    return fetch(resourceUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.secret}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': MODERN_PROTOCOL_VERSION,
        ...(input.mcpMethod && { 'Mcp-Method': input.mcpMethod }),
      },
      body: input.body,
    });
  }

  async function createActorAndKey() {
    const agent = request.agent(app.getHttpServer()).set('Origin', baseUrl);
    const signUp = await agent.post('/api/auth/sign-up/email').send({
      email,
      name: 'Work OS MCP Integration',
      password: 'StrongPassword123!',
      username: 'workosmcpintegration',
    });
    expect(signUp.status).toBe(200);
    agent.set('Cookie', toCookieHeader(signUp.headers['set-cookie']));

    const createdOrganization = await agent.post('/organizations').send({
      name: 'Work OS MCP Integration',
      slug: organizationSlug,
    });
    expect(createdOrganization.status).toBe(201);
    const organizationId = createdOrganization.body.organization.id as string;

    const initialAccess = await agent.get(
      `/organizations/${organizationId}/mcp-access`,
    );
    expect(initialAccess.status).toBe(200);
    const organizationUpdate = await agent
      .patch(`/organizations/${organizationId}/mcp-access/organization-policy`)
      .send({
        allowedScopes: ['wiki:read', 'wiki:write'],
        expectedRevision: initialAccess.body.organizationPolicy.revision,
      });
    expect(organizationUpdate.status).toBe(200);
    const userUpdate = await agent
      .patch(`/organizations/${organizationId}/mcp-access/me`)
      .send({
        requestedScopes: ['wiki:read', 'wiki:write'],
        expectedRevision: organizationUpdate.body.myPolicy.revision,
      });
    expect(userUpdate.status).toBe(200);
    const userPolicyRevision = userUpdate.body.myPolicy.revision as number;

    const keyResponse = await agent
      .post('/mcp/access-keys')
      .set('Idempotency-Key', `work-os-mcp-${Date.now()}`)
      .send({
        name: 'MCP integration key',
        scopes: ['wiki:read', 'wiki:write'],
        organizationGrant: {
          mode: 'selected',
          organizationIds: [organizationId],
        },
        expiresInDays: 1,
      });
    expect(keyResponse.status).toBe(201);
    await expect(
      app
        .get(McpAccessKeyAuthenticator)
        .authenticate(keyResponse.body.secret as string),
    ).resolves.toMatchObject({ userId: signUp.body.user.id });

    return {
      agent,
      organizationId,
      keyId: keyResponse.body.key.id as string,
      secret: keyResponse.body.secret as string,
      userPolicyRevision,
    };
  }

  async function cleanup(): Promise<void> {
    const [storedUser] = await database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    if (storedUser) {
      await database
        .delete(apikey)
        .where(eq(apikey.referenceId, storedUser.id));
      await database.delete(session).where(eq(session.userId, storedUser.id));
      await database.delete(account).where(eq(account.userId, storedUser.id));
      await database
        .delete(organization)
        .where(eq(organization.slug, organizationSlug));
      await database.delete(user).where(eq(user.id, storedUser.id));
      return;
    }
    await database
      .delete(organization)
      .where(eq(organization.slug, organizationSlug));
  }
});

async function reservePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function toCookieHeader(value: string | string[] | undefined): string {
  if (!value)
    throw new Error('테스트 회원가입 응답에 session cookie가 없습니다.');
  const values = Array.isArray(value) ? value : [value];
  return values.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

function createModernClient(name: string): Client {
  return new Client(
    { name, version: '0.0.1' },
    { versionNegotiation: { mode: { pin: MODERN_PROTOCOL_VERSION } } },
  );
}
