import {
  AgentMcpNamespaceSchema,
  createAgentMcpNamespace,
  createAgentMcpToolName,
  createAgentMcpToolSchemaFingerprint,
} from '@/agent-mcp-connections/domain/agent-mcp-tool-identity';

describe('외부 MCP tool identity 계약', () => {
  test('namespace는 예약어를 피한 안전한 서버 생성 식별자다', () => {
    const namespace = createAgentMcpNamespace();

    expect(AgentMcpNamespaceSchema.parse(namespace)).toBe(namespace);
    expect(namespace).toMatch(/^ext[a-z0-9]+$/);
    expect(() => AgentMcpNamespaceSchema.parse('workos')).toThrow();
    expect(() => AgentMcpNamespaceSchema.parse('internal')).toThrow();
  });

  test('이미 안전한 tool 이름은 namespace를 안정적으로 prefix한다', () => {
    expect(createAgentMcpToolName('extgithub', 'search_issues')).toBe(
      'extgithub__search_issues',
    );
  });

  test('안전하지 않거나 긴 tool 이름은 deterministic hash로 충돌을 피한다', () => {
    const first = createAgentMcpToolName(
      'extgithub',
      'Search issues / private repo with a very long external tool name 1234567890',
    );
    const second = createAgentMcpToolName(
      'extgithub',
      'Search issues / private repo with a very long external tool name 1234567890',
    );
    const different = createAgentMcpToolName(
      'extgithub',
      'Search issues : private repo with a very long external tool name 1234567890',
    );

    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('schema fingerprint는 object key 순서와 무관하다', () => {
    const left = createAgentMcpToolSchemaFingerprint({
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    });
    const right = createAgentMcpToolSchemaFingerprint({
      properties: {
        limit: { type: 'number' },
        query: { type: 'string' },
      },
      type: 'object',
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
  });

  test('schema array 순서는 fingerprint 의미에 포함한다', () => {
    expect(
      createAgentMcpToolSchemaFingerprint({
        enum: ['read', 'write'],
      }),
    ).not.toBe(
      createAgentMcpToolSchemaFingerprint({
        enum: ['write', 'read'],
      }),
    );
  });

  test('과도하게 긴 원본 tool 이름은 거부한다', () => {
    expect(() =>
      createAgentMcpToolName('extgithub', 'x'.repeat(257)),
    ).toThrow();
  });

  test('과도하게 깊거나 큰 tool schema는 fingerprint 전에 거부한다', () => {
    let deep: unknown = { type: 'string' };
    for (let index = 0; index < 34; index += 1) {
      deep = { nested: deep };
    }

    expect(() => createAgentMcpToolSchemaFingerprint(deep)).toThrow('depth');
    expect(() =>
      createAgentMcpToolSchemaFingerprint({
        type: 'object',
        description: 'x'.repeat(129 * 1024),
      }),
    ).toThrow('크기');
  });
});
