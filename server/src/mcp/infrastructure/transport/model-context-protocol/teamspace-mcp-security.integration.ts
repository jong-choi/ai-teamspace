import type { McpScope } from '@/mcp/contracts/mcp-scope';
import { MCP_ACCESS_KEY_PREFIX } from '@/mcp-access-keys/domain/mcp-access-key-contract';

import {
  McpIntegrationApp,
  modernMcpRequest,
} from '@test/support/mcp-integration.fixture';
import request from 'supertest';

const WIKI_SCOPES: readonly McpScope[] = ['wiki:read', 'wiki:write'];
const UNKNOWN_ACCESS_KEY = `${MCP_ACCESS_KEY_PREFIX}unknown-integration-secret`;

describe('AI Teamspace MCP 요청 보안 순서 통합', () => {
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

  it('허용되지 않은 Host는 credential을 검증하기 전에 거부한다', async () => {
    const response = await postMcp({
      Host: 'evil.example',
      Authorization: `Bearer ${UNKNOWN_ACCESS_KEY}`,
    });

    expect(response.status).toBe(403);
    expect(response.headers['www-authenticate']).toBeUndefined();
  });

  it('허용되지 않은 Origin은 credential을 검증하기 전에 거부한다', async () => {
    const response = await postMcp({
      Origin: 'https://evil.example',
      Authorization: `Bearer ${UNKNOWN_ACCESS_KEY}`,
    });

    expect(response.status).toBe(403);
    expect(response.headers['www-authenticate']).toBeUndefined();
  });

  it('Authorization과 X-API-Key를 함께 보내거나 Bearer가 아닌 Authorization은 400으로 거부한다', async () => {
    const ambiguous = await postMcp({
      Authorization: `Bearer ${UNKNOWN_ACCESS_KEY}`,
      'X-API-Key': UNKNOWN_ACCESS_KEY,
    });
    const basic = await postMcp({ Authorization: 'Basic dXNlcjpwYXNz' });

    for (const response of [ambiguous, basic]) {
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        jsonrpc: '2.0',
        error: { code: -32000 },
      });
    }
  });

  it('credential이 없거나 알 수 없는 access key는 RFC 9728 resource metadata challenge와 함께 401을 반환한다', async () => {
    const missing = await postMcp({});
    const unknown = await postMcp({
      Authorization: `Bearer ${UNKNOWN_ACCESS_KEY}`,
    });

    for (const response of [missing, unknown]) {
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toContain(
        `resource_metadata="${target.baseUrl}/.well-known/oauth-protected-resource/mcp"`,
      );
    }
    expect(JSON.stringify(unknown.body)).not.toContain(UNKNOWN_ACCESS_KEY);
  });

  it('X-API-Key header의 access key로도 official client가 도구를 조회한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const mcp = await target.connectClient({
      name: 'teamspace-x-api-key',
      headers: { 'X-API-Key': actor.secret },
    });

    try {
      const tools = await mcp.client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain('wiki_search');
    } finally {
      await mcp.close();
    }
  });

  it('legacy GET/DELETE 요청은 405와 Allow: POST로 거부한다', async () => {
    const http = request(target.app.getHttpServer());

    for (const response of [
      await http.get('/mcp'),
      await http.delete('/mcp'),
    ]) {
      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe('POST');
    }
  });

  function postMcp(headers: Record<string, string>) {
    const toolsList = modernMcpRequest('tools/list');
    return request(target.app.getHttpServer())
      .post('/mcp')
      .set({ ...toolsList.headers, ...headers })
      .send(toolsList.body);
  }
});
