import { WORK_OS_MCP_PROTOCOL_VERSION } from '@/mcp/contracts/mcp-protocol';
import type { McpScope } from '@/mcp/contracts/mcp-scope';
import { WikiDocumentSchema } from '@/wiki/dto/wiki-document.dto';

import {
  type McpActor,
  McpIntegrationApp,
} from '@test/support/mcp-integration.fixture';
import request from 'supertest';

const WIKI_SCOPES: readonly McpScope[] = ['wiki:read', 'wiki:write'];

describe('실제 Work OS MCP transport 통합', () => {
  let target: McpIntegrationApp;

  beforeAll(async () => {
    target = await McpIntegrationApp.start();
  });

  afterEach(async () => {
    await target.cleanupActors();
  });

  afterAll(async () => {
    await target.close();
  });

  it('actual PAT로 official client가 scope-filtered tools를 조회하고 Wiki write를 영속화한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const mcp = await connectWithAccessKey(actor, 'work-os-integration');

    try {
      const tools = await mcp.client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        'wiki_search',
        'wiki_document_get',
        'wiki_document_create',
        'wiki_document_update',
      ]);

      const created = await mcp.client.callTool({
        name: 'wiki_document_create',
        arguments: {
          organizationId: actor.organizationId,
          title: 'MCP 통합 문서',
          contentMarkdown: '# actual MCP write',
        },
      });
      expect(created.isError).not.toBe(true);
      const document = WikiDocumentSchema.parse(created.structuredContent);

      const authoritative = await actor.agent.get(
        `/organizations/${actor.organizationId}/wiki/documents/${document.id}`,
      );
      expect(authoritative.status).toBe(200);
      expect(authoritative.body).toMatchObject({
        id: document.id,
        title: 'MCP 통합 문서',
        contentMarkdown: '# actual MCP write',
      });
    } finally {
      await mcp.close();
    }
  });

  it('tools/list 뒤 user policy를 축소하면 stale write invocation을 call-time에 차단한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const mcp = await connectWithAccessKey(actor, 'work-os-policy-race');

    try {
      const tools = await mcp.client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain(
        'wiki_document_create',
      );

      const shrink = await actor.agent
        .patch(`/organizations/${actor.organizationId}/mcp-access/me`)
        .send({
          requestedScopes: ['wiki:read'],
          expectedRevision: actor.userPolicyRevision,
        });
      expect(shrink.status).toBe(200);

      const denied = await mcp.client.callTool({
        name: 'wiki_document_create',
        arguments: {
          organizationId: actor.organizationId,
          title: '차단되어야 하는 문서',
        },
      });
      expect(denied.isError).toBe(true);
      expect(JSON.stringify(denied)).not.toContain(actor.secret);
      const search = await actor.agent.get(
        `/organizations/${actor.organizationId}/wiki/search?q=${encodeURIComponent('차단되어야 하는 문서')}`,
      );
      expect(search.status).toBe(200);
      expect(search.body.items).toHaveLength(0);
    } finally {
      await mcp.close();
    }
  });

  it('PAT revoke 후 같은 secret의 새 MCP connection을 거부한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    await actor.agent.delete(`/mcp/access-keys/${actor.keyId}`).expect(204);

    await expect(
      connectWithAccessKey(actor, 'work-os-revoked-key'),
    ).rejects.toThrow();
  });

  it('root OAuth discovery 문서가 MCP resource와 Better Auth issuer를 가리킨다', async () => {
    const http = request(target.app.getHttpServer());

    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      const resourceMetadata = await http.get(path);
      expect(resourceMetadata.status).toBe(200);
      expect(resourceMetadata.body).toMatchObject({
        resource: target.resourceUrl,
        authorization_servers: [`${target.baseUrl}/api/auth`],
      });
    }

    const authorizationMetadata = await http.get(
      '/.well-known/oauth-authorization-server/api/auth',
    );
    expect(authorizationMetadata.status).toBe(200);
    expect(authorizationMetadata.body).toMatchObject({
      issuer: `${target.baseUrl}/api/auth`,
      authorization_endpoint: `${target.baseUrl}/api/auth/oauth2/authorize`,
    });

    const head = await http.head('/.well-known/oauth-protected-resource/mcp');
    expect(head.status).toBe(200);
    expect(head.text).toBeUndefined();
  });

  it('잘못된 JSON은 전역 parser가 아니라 MCP transport가 JSON-RPC parse error로 거부한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });

    const response = await postRawMcp({
      secret: actor.secret,
      body: '{"jsonrpc":',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32700 },
    });
  });

  it('MCP 요청 크기 제한은 전역 JSON parser 제한이 아니라 MCP 설정을 따른다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const maxBytes = Number(process.env.MCP_MAX_REQUEST_BODY_BYTES);
    const listToolsWithPadding = (padding: number) =>
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion':
              WORK_OS_MCP_PROTOCOL_VERSION,
            'io.modelcontextprotocol/clientCapabilities': {},
            padding: 'x'.repeat(padding),
          },
        },
      });

    // 전역 JSON parser 기본 제한(100kb)보다 크고 MCP 제한보다 작은 요청이다.
    const withinMcpLimit = await postRawMcp({
      secret: actor.secret,
      body: listToolsWithPadding(maxBytes - 1_000),
      mcpMethod: 'tools/list',
    });
    expect(withinMcpLimit.status).toBe(200);

    const overMcpLimit = await postRawMcp({
      secret: actor.secret,
      body: listToolsWithPadding(maxBytes),
      mcpMethod: 'tools/list',
    });
    expect(overMcpLimit.status).toBe(413);
  });

  function connectWithAccessKey(actor: McpActor, name: string) {
    return target.connectClient({
      name,
      headers: { Authorization: `Bearer ${actor.secret}` },
    });
  }

  function postRawMcp(input: {
    secret: string;
    body: string;
    mcpMethod?: string;
  }): Promise<Response> {
    return fetch(target.resourceUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.secret}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': WORK_OS_MCP_PROTOCOL_VERSION,
        ...(input.mcpMethod && { 'Mcp-Method': input.mcpMethod }),
      },
      body: input.body,
    });
  }
});
