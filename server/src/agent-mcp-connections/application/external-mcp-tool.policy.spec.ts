import { AgentMcpConnectionSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import { AgentMcpConnectionToolSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection-tool';
import { createAgentMcpToolSchemaFingerprint } from '@/agent-mcp-connections/domain/agent-mcp-tool-identity';
import { ExternalMcpToolPolicy } from '@/agent-mcp-connections/application/external-mcp-tool.policy';

import type { StructuredTool } from '@langchain/core/tools';

describe('외부 MCP tool policy', () => {
  const connection = AgentMcpConnectionSchema.parse({
    id: '0199d54e-282e-7adf-8000-000000000001',
    ownerUserId: 'user-1',
    organizationId: 'org-1',
    displayName: 'External',
    namespace: 'extexample1',
    endpoint: 'https://example.com/mcp',
    transport: 'http',
    authKind: 'none',
    enabled: true,
    toolPolicyMode: 'selected',
    lastTestedAt: null,
    lastErrorCategory: null,
    revision: 1,
    createdAt: new Date('2026-10-07T00:00:00.000Z'),
    updatedAt: new Date('2026-10-07T00:00:00.000Z'),
  });

  function tool(name: string, schema: unknown): StructuredTool {
    return {
      name,
      schema,
      metadata: {
        annotations: { readOnlyHint: true },
        workOsMcp: { source: 'workos' },
      },
    } as unknown as StructuredTool;
  }

  test('selected tool만 노출하고 trusted external metadata로 server spoof를 덮어쓴다', () => {
    const schema = {
      type: 'object',
      properties: { query: { type: 'string' } },
    };
    const selected = AgentMcpConnectionToolSchema.parse({
      id: '0199d54e-282e-7adf-8000-000000000002',
      connectionId: connection.id,
      originalToolName: 'search issues',
      schemaFingerprint: createAgentMcpToolSchemaFingerprint(schema),
      enabled: true,
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
      updatedAt: new Date('2026-10-07T00:00:00.000Z'),
    });
    const policy = new ExternalMcpToolPolicy();

    const result = policy.selectTools(
      connection,
      [tool('search issues', schema), tool('delete_all', { type: 'object' })],
      [selected],
      100,
    );

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]?.name).toMatch(/^extexample1__/);
    expect(result.tools[0]?.metadata?.['workOsMcp']).toMatchObject({
      source: 'external',
      connectionId: connection.id,
      originalToolName: 'search issues',
    });
    expect(result.tools[0]?.metadata?.['annotations']).toEqual({
      readOnlyHint: true,
    });
    expect([...result.toolIdentities.values()]).toEqual([
      expect.objectContaining({
        source: 'external',
        connectionId: connection.id,
        originalToolName: 'search issues',
      }),
    ]);
  });

  test('선택 시점 이후 schema가 바뀌면 fail-closed로 tool을 숨긴다', () => {
    const selected = AgentMcpConnectionToolSchema.parse({
      id: '0199d54e-282e-7adf-8000-000000000003',
      connectionId: connection.id,
      originalToolName: 'search',
      schemaFingerprint: createAgentMcpToolSchemaFingerprint({
        type: 'object',
        properties: { query: { type: 'string' } },
      }),
      enabled: true,
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
      updatedAt: new Date('2026-10-07T00:00:00.000Z'),
    });

    expect(
      new ExternalMcpToolPolicy().selectTools(
        connection,
        [
          tool('search', {
            type: 'object',
            properties: { query: { type: 'number' } },
          }),
        ],
        [selected],
        100,
      ).tools,
    ).toEqual([]);
  });

  test('discovery tool count가 bound를 넘으면 connection을 거부한다', () => {
    expect(() =>
      new ExternalMcpToolPolicy().selectTools(
        { ...connection, toolPolicyMode: 'all' },
        [tool('a', { type: 'object' }), tool('b', { type: 'object' })],
        [],
        1,
      ),
    ).toThrow('허용 한도를 초과');
  });

  test('과도한 description과 중복 tool 이름은 runtime 노출 전에 거부한다', () => {
    const oversized = tool('search', { type: 'object' });
    oversized.description = '가'.repeat(2_000);

    expect(() =>
      new ExternalMcpToolPolicy().selectTools(
        { ...connection, toolPolicyMode: 'all' },
        [oversized],
        [],
        100,
      ),
    ).toThrow('description');

    expect(() =>
      new ExternalMcpToolPolicy().selectTools(
        { ...connection, toolPolicyMode: 'all' },
        [
          tool('duplicate', { type: 'object' }),
          tool('duplicate', { type: 'object' }),
        ],
        [],
        100,
      ),
    ).toThrow('이름 충돌');
  });
});
