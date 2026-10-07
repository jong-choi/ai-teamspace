import { agentMcpConnectionToolInsertSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection-tool.zod';

describe('외부 MCP tool policy persistence 계약', () => {
  test('schema fingerprint 없이도 selected tool identity를 저장할 수 있다', () => {
    const parsed = agentMcpConnectionToolInsertSchema.parse({
      connectionId: '0199d54e-282e-7adf-8000-000000000001',
      originalToolName: 'search_issues',
    });

    expect(parsed.originalToolName).toBe('search_issues');
    expect(parsed.schemaFingerprint).toBeUndefined();
  });

  test('schema fingerprint는 SHA-256 hex 형식만 허용한다', () => {
    expect(() =>
      agentMcpConnectionToolInsertSchema.parse({
        connectionId: '0199d54e-282e-7adf-8000-000000000001',
        originalToolName: 'search_issues',
        schemaFingerprint: 'not-a-fingerprint',
      }),
    ).toThrow();

    expect(
      agentMcpConnectionToolInsertSchema.parse({
        connectionId: '0199d54e-282e-7adf-8000-000000000001',
        originalToolName: 'search_issues',
        schemaFingerprint: 'a'.repeat(64),
      }).schemaFingerprint,
    ).toBe('a'.repeat(64));
  });
});
