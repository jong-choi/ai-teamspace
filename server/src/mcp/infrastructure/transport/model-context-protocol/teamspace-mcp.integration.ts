import { randomUUID } from 'node:crypto';

import {
  mutationToolOutputSchema,
  ProjectTicketMutationReceiptSchema,
  WikiDocumentMutationReceiptSchema,
} from '@/mcp/contracts/agent-mutation-receipt.dto';
import { MCP_SCOPES, type McpScope } from '@/mcp/contracts/mcp-scope';
import { v1McpToolDefinitions } from '@/mcp/tools/v1-tool-manifest';
import { OrganizationListSchema } from '@/organizations/dto/organization-list.dto';
import { TicketSchema } from '@/projects/domain/ticket';
import { WikiDocumentSchema } from '@/wiki/dto/wiki-document.dto';

import {
  type McpActor,
  McpIntegrationApp,
  modernMcpRequest,
} from '@test/support/mcp-integration.fixture';
import request from 'supertest';

const WIKI_SCOPES: readonly McpScope[] = ['wiki:read', 'wiki:write'];

describe('실제 AI Teamspace MCP transport 통합', () => {
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
      const output = mutationToolOutputSchema(
        WikiDocumentSchema,
        WikiDocumentMutationReceiptSchema,
      ).parse(created.structuredContent);
      const document = output.result;
      expect(output.mutation).toMatchObject({
        kind: 'wiki_document',
        operation: 'created',
        organizationId: actor.organizationId,
        resourceId: document.id,
        revision: document.revision,
      });

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

  it('전체 scope actor는 v1 manifest의 23개 도구를 manifest 순서로 본다', async () => {
    const actor = await target.createActor({ scopes: MCP_SCOPES });
    const mcp = await connectWithAccessKey(actor, 'work-os-full-scope');

    try {
      const tools = await mcp.client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        v1McpToolDefinitions.map((definition) => definition.name),
      );
    } finally {
      await mcp.close();
    }
  });

  it('read scope만 가진 actor는 discovery에서 변경 도구를 보지 못한다', async () => {
    const readScopes = MCP_SCOPES.filter((scope) => scope.endsWith(':read'));
    const actor = await target.createActor({ scopes: readScopes });
    const mcp = await connectWithAccessKey(actor, 'work-os-read-only');

    try {
      const tools = await mcp.client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        v1McpToolDefinitions
          .filter((definition) => definition.classification === 'read')
          .map((definition) => definition.name),
      );
    } finally {
      await mcp.close();
    }
  });

  it('key의 organization grant 밖 조직은 호출과 조직 목록에서 모두 막는다', async () => {
    const actor = await target.createActor({
      scopes: ['organizations:read', ...WIKI_SCOPES],
    });
    const { organizationId: ungrantedOrganizationId } =
      await target.addOrganization(actor, { scopes: WIKI_SCOPES });
    const mcp = await connectWithAccessKey(actor, 'work-os-grant');

    try {
      const denied = await mcp.client.callTool({
        name: 'wiki_search',
        arguments: { organizationId: ungrantedOrganizationId, q: 'MCP' },
      });
      expect(denied.isError).toBe(true);

      const organizations = await mcp.client.callTool({
        name: 'organizations_list',
        arguments: {},
      });
      expect(organizations.isError).not.toBe(true);
      expect(
        OrganizationListSchema.parse(organizations.structuredContent).items.map(
          (item) => item.id,
        ),
      ).toEqual([actor.organizationId]);
    } finally {
      await mcp.close();
    }
  });

  it('조직 policy를 축소하면 연결된 session의 write 호출을 call-time에 거부한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const mcp = await connectWithAccessKey(actor, 'work-os-org-policy');

    try {
      const access = await actor.agent.get(
        `/organizations/${actor.organizationId}/mcp-access`,
      );
      await actor.agent
        .patch(
          `/organizations/${actor.organizationId}/mcp-access/organization-policy`,
        )
        .send({
          allowedScopes: ['wiki:read'],
          expectedRevision: access.body.organizationPolicy.revision,
        })
        .expect(200);

      const denied = await mcp.client.callTool({
        name: 'wiki_document_create',
        arguments: {
          organizationId: actor.organizationId,
          title: '조직 policy로 차단되는 문서',
        },
      });
      expect(denied.isError).toBe(true);
    } finally {
      await mcp.close();
    }
  });

  it('조직·채팅·위키·프로젝트·일정 read 도구가 실제 데이터를 조회한다', async () => {
    const actor = await target.createActor({
      scopes: MCP_SCOPES.filter((scope) => scope.endsWith(':read')),
    });
    const document = await actor.agent
      .post(`/organizations/${actor.organizationId}/wiki/documents`)
      .send({ title: 'MCP read 대상 문서' })
      .expect(201);
    const project = await actor.agent
      .post(`/organizations/${actor.organizationId}/projects`)
      .send({ key: 'MCPR', name: 'MCP read 대상 프로젝트' })
      .expect(201);
    const mcp = await connectWithAccessKey(actor, 'work-os-domain-read');
    const organizationId = actor.organizationId;

    try {
      const results = {
        organizations: await mcp.client.callTool({
          name: 'organizations_list',
          arguments: {},
        }),
        chat: await mcp.client.callTool({
          name: 'chat_conversations_list',
          arguments: { organizationId },
        }),
        wiki: await mcp.client.callTool({
          name: 'wiki_document_get',
          arguments: { organizationId, documentId: document.body.id },
        }),
        projects: await mcp.client.callTool({
          name: 'project_get',
          arguments: { organizationId, projectId: project.body.id },
        }),
        calendar: await mcp.client.callTool({
          name: 'calendar_meetings_list',
          arguments: {
            organizationId,
            from: '2026-10-01T00:00:00.000Z',
            to: '2026-10-31T00:00:00.000Z',
          },
        }),
      };

      for (const result of Object.values(results)) {
        expect(result.isError).not.toBe(true);
      }
      expect(results.wiki.structuredContent).toMatchObject({
        id: document.body.id,
        title: 'MCP read 대상 문서',
      });
      expect(results.projects.structuredContent).toMatchObject({
        id: project.body.id,
        key: 'MCPR',
      });
    } finally {
      await mcp.close();
    }
  });

  it('project_ticket_create 결과가 REST 조회 결과와 일치한다', async () => {
    const actor = await target.createActor({
      scopes: ['projects:read', 'projects:write'],
    });
    const project = await actor.agent
      .post(`/organizations/${actor.organizationId}/projects`)
      .send({ key: 'MCPW', name: 'MCP write 대상 프로젝트' })
      .expect(201);
    const column = await actor.agent
      .post(
        `/organizations/${actor.organizationId}/projects/${project.body.id}/columns`,
      )
      .send({ name: '할 일' })
      .expect(201);
    const mcp = await connectWithAccessKey(actor, 'work-os-ticket-write');

    try {
      const created = await mcp.client.callTool({
        name: 'project_ticket_create',
        arguments: {
          organizationId: actor.organizationId,
          projectId: project.body.id,
          columnId: column.body.id,
          title: 'MCP로 만든 ticket',
        },
      });
      expect(created.isError).not.toBe(true);
      const output = mutationToolOutputSchema(
        TicketSchema.pick({ id: true }),
        ProjectTicketMutationReceiptSchema,
      ).parse(created.structuredContent);
      const ticket = output.result;
      expect(output.mutation).toMatchObject({
        kind: 'project_ticket',
        operation: 'created',
        organizationId: actor.organizationId,
        projectId: project.body.id,
        resourceId: ticket.id,
      });

      const authoritative = await actor.agent
        .get(
          `/organizations/${actor.organizationId}/projects/${project.body.id}/tickets/${ticket.id}`,
        )
        .expect(200);
      expect(authoritative.body).toMatchObject({
        id: ticket.id,
        title: 'MCP로 만든 ticket',
        columnId: column.body.id,
      });
    } finally {
      await mcp.close();
    }
  });

  it('domain not found는 내부 정보 없이 tool error로 응답한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const mcp = await connectWithAccessKey(actor, 'work-os-not-found');

    try {
      const missing = await mcp.client.callTool({
        name: 'wiki_document_get',
        arguments: {
          organizationId: actor.organizationId,
          documentId: randomUUID(),
        },
      });

      expect(missing.isError).toBe(true);
      const serialized = JSON.stringify(missing);
      expect(serialized).not.toMatch(/select |stack|drizzle|postgres/iu);
      expect(serialized).not.toContain(actor.secret);
    } finally {
      await mcp.close();
    }
  });

  it('tool 입력 element 상한을 넘는 요청은 실행 전에 거부한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const mcp = await connectWithAccessKey(actor, 'work-os-input-bound');
    const maxElements = target.mcpConfig.protocol.maxToolInputElements;

    try {
      await expect(
        mcp.client.callTool({
          name: 'wiki_document_create',
          arguments: {
            organizationId: actor.organizationId,
            title: '입력 상한 초과 문서',
            padding: Array.from(
              { length: maxElements + 1 },
              (_, index) => index,
            ),
          },
        }),
      ).rejects.toThrow(/상한/u);
      const search = await actor.agent.get(
        `/organizations/${actor.organizationId}/wiki/search?q=${encodeURIComponent('입력 상한 초과 문서')}`,
      );
      expect(search.body.items).toHaveLength(0);
    } finally {
      await mcp.close();
    }
  });

  it('잘못된 JSON은 전역 parser가 아니라 MCP transport가 JSON-RPC parse error로 거부한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const { headers } = modernMcpRequest('tools/list');

    const response = await postMcp(actor, { headers, body: '{"jsonrpc":' });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32700 },
    });
  });

  it('MCP 요청 크기 제한은 전역 JSON parser 제한이 아니라 MCP 설정을 따른다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const maxBytes = target.mcpConfig.protocol.maxRequestBodyBytes;
    const paddedToolsList = (padding: number) =>
      modernMcpRequest('tools/list', { padding: 'x'.repeat(padding) });

    // 전역 JSON parser 기본 제한(100kb)보다 크고 MCP 제한보다 작은 요청이다.
    const withinMcpLimit = await postMcp(
      actor,
      paddedToolsList(maxBytes - 1_000),
    );
    expect(withinMcpLimit.status).toBe(200);

    const overMcpLimit = await postMcp(actor, paddedToolsList(maxBytes));
    expect(overMcpLimit.status).toBe(413);
  });

  function connectWithAccessKey(actor: McpActor, name: string) {
    return target.connectClient({
      name,
      headers: { Authorization: `Bearer ${actor.secret}` },
    });
  }

  function postMcp(
    actor: McpActor,
    mcpRequest: { headers: Record<string, string>; body: string },
  ): Promise<Response> {
    return fetch(target.resourceUrl, {
      method: 'POST',
      headers: {
        ...mcpRequest.headers,
        Authorization: `Bearer ${actor.secret}`,
      },
      body: mcpRequest.body,
    });
  }
});
