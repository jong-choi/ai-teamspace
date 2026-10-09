import { GraphNodeKindSchema } from '@/knowledge-graph/domain/graph-read-contract';
import { ExploreQuerySchema } from '@/knowledge-graph/dto/graph-snapshot.dto';
import { KnowledgeContextInputSchema } from '@/mcp/tools/knowledge-graph/knowledge-graph-tool-definitions';

describe('KnowledgeContextInputSchema REST explore 계약 동치', () => {
  const organizationId = 'org-a';

  function restAccepts(focus: Record<string, unknown>) {
    return ExploreQuerySchema.safeParse(focus).success;
  }

  function mcpAccepts(focus: Record<string, unknown>) {
    return KnowledgeContextInputSchema.safeParse({
      organizationId,
      ...focus,
    }).success;
  }

  it.each(GraphNodeKindSchema.options)(
    'focusKind %s는 REST explore와 MCP context가 모두 허용한다',
    (focusKind) => {
      const focus = { focusKind, focusId: 'node-a', depth: 1 };

      expect(restAccepts(focus)).toBe(true);
      expect(mcpAccepts(focus)).toBe(true);
    },
  );

  it.each([
    ['최소 길이', 'a'],
    ['최대 길이', 'a'.repeat(512)],
  ])(
    'focusId %s는 REST explore와 MCP context가 모두 허용한다',
    (_label, focusId) => {
      const focus = { focusKind: 'wiki_document', focusId, depth: 1 };

      expect(restAccepts(focus)).toBe(true);
      expect(mcpAccepts(focus)).toBe(true);
    },
  );

  it.each([
    ['빈 값', ''],
    ['상한 초과', 'a'.repeat(513)],
  ])(
    'focusId %s는 REST explore와 MCP context가 모두 거부한다',
    (_label, focusId) => {
      const focus = { focusKind: 'wiki_document', focusId, depth: 1 };

      expect(restAccepts(focus)).toBe(false);
      expect(mcpAccepts(focus)).toBe(false);
    },
  );

  it.each([
    ['최솟값', 1],
    ['최댓값', 2],
    ['최댓값 문자열 coercion', '2'],
  ])(
    'depth %s은 REST explore와 MCP context가 모두 허용한다',
    (_label, depth) => {
      const focus = {
        focusKind: 'wiki_document',
        focusId: 'node-a',
        depth,
      };

      expect(restAccepts(focus)).toBe(true);
      expect(mcpAccepts(focus)).toBe(true);
    },
  );

  it.each([
    ['하한 미만', 0],
    ['상한 초과', 3],
    ['정수가 아님', 1.5],
  ])(
    'depth %s은 REST explore와 MCP context가 모두 거부한다',
    (_label, depth) => {
      const focus = {
        focusKind: 'wiki_document',
        focusId: 'node-a',
        depth,
      };

      expect(restAccepts(focus)).toBe(false);
      expect(mcpAccepts(focus)).toBe(false);
    },
  );

  it('depth 생략 시 REST explore와 MCP context가 모두 1을 기본값으로 사용한다', () => {
    const focus = {
      focusKind: 'wiki_document' as const,
      focusId: 'node-a',
    };

    expect(ExploreQuerySchema.parse(focus).depth).toBe(1);
    expect(
      KnowledgeContextInputSchema.parse({
        organizationId,
        ...focus,
      }).depth,
    ).toBe(1);
  });

  it('MCP context는 REST focus 공통 필드와 organizationId만 허용한다', () => {
    expect(
      KnowledgeContextInputSchema.parse({
        organizationId,
        focusKind: 'wiki_document',
        focusId: 'node-a',
        depth: 2,
      }),
    ).toEqual({
      organizationId,
      focusKind: 'wiki_document',
      focusId: 'node-a',
      depth: 2,
    });

    for (const restOnlyField of [
      { q: 'seed' },
      { limit: 50 },
      { cursor: 'cursor' },
    ]) {
      expect(
        KnowledgeContextInputSchema.safeParse({
          organizationId,
          focusKind: 'wiki_document',
          focusId: 'node-a',
          ...restOnlyField,
        }).success,
      ).toBe(false);
    }
  });

  it('strict 계약으로 raw Cypher 같은 정의 밖 필드는 REST와 MCP가 모두 거부한다', () => {
    const focus = {
      focusKind: 'wiki_document',
      focusId: 'node-a',
      depth: 1,
      cypher: 'MATCH (n) RETURN n',
    };

    expect(restAccepts(focus)).toBe(false);
    expect(mcpAccepts(focus)).toBe(false);
  });
});
