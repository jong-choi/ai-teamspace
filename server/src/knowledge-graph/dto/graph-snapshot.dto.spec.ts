import {
  ExploreQuerySchema,
  GraphEdgeListQuerySchema,
  GraphNodeListQuerySchema,
} from '@/knowledge-graph/dto/graph-snapshot.dto';

describe('U8-07 A2 조회 DTO strict 계약', () => {
  it('explore depth와 limit 경계를 강제한다', () => {
    const base = {
      focusKind: 'wiki_document',
      focusId: 'opaque-node',
    };
    expect(ExploreQuerySchema.safeParse({ ...base, depth: 1, limit: 1 }).success)
      .toBe(true);
    expect(ExploreQuerySchema.safeParse({ ...base, depth: 2, limit: 100 }).success)
      .toBe(true);
    expect(ExploreQuerySchema.safeParse({ ...base, depth: 0 }).success)
      .toBe(false);
    expect(ExploreQuerySchema.safeParse({ ...base, depth: 3 }).success)
      .toBe(false);
    expect(ExploreQuerySchema.safeParse({ ...base, limit: 0 }).success)
      .toBe(false);
    expect(ExploreQuerySchema.safeParse({ ...base, limit: 101 }).success)
      .toBe(false);
  });

  it.each(['cypher', 'label', 'model'])(
    'explore에서 허용하지 않은 %s 입력을 거부한다',
    (field) => {
      expect(
        ExploreQuerySchema.safeParse({
          focusKind: 'wiki_document',
          focusId: 'opaque-node',
          [field]: 'raw-input',
        }).success,
      ).toBe(false);
    },
  );

  it('노드와 엣지 목록도 알려지지 않은 입력과 limit 범위를 거부한다', () => {
    expect(
      GraphNodeListQuerySchema.safeParse({
        kind: 'project',
        limit: 50,
        cypher: 'MATCH (n)',
      }).success,
    ).toBe(false);
    expect(
      GraphEdgeListQuerySchema.safeParse({
        relation: 'ticket_project',
        model: 'x',
      }).success,
    ).toBe(false);
    expect(GraphNodeListQuerySchema.safeParse({ limit: 101 }).success)
      .toBe(false);
    expect(GraphEdgeListQuerySchema.safeParse({ limit: 0 }).success)
      .toBe(false);
  });
});
