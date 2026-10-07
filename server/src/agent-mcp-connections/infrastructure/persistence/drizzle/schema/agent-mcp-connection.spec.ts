import { agentMcpConnectionInsertSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.zod';

describe('외부 MCP connection persistence 계약', () => {
  test('insert schema가 endpoint와 display name을 정규화한다', () => {
    const parsed = agentMcpConnectionInsertSchema.parse({
      ownerUserId: 'user-1',
      organizationId: 'org-1',
      displayName: '  GitHub MCP  ',
      namespace: 'extgithub1',
      endpoint: 'HTTPS://Example.COM:443/custom/mcp',
      authKind: 'none',
    });

    expect(parsed.displayName).toBe('GitHub MCP');
    expect(parsed.endpoint).toBe('https://example.com/custom/mcp');
  });

  test('예약 namespace와 unsafe endpoint를 거부한다', () => {
    expect(() =>
      agentMcpConnectionInsertSchema.parse({
        ownerUserId: 'user-1',
        organizationId: 'org-1',
        displayName: 'unsafe',
        namespace: 'workos',
        endpoint: 'http://127.0.0.1/mcp',
        authKind: 'none',
      }),
    ).toThrow();
  });
});
