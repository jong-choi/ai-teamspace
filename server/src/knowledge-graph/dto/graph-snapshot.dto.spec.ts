import {
  ExploreQuerySchema,
  GraphEdgeListQuerySchema,
  GraphEdgeSchema,
  GraphNodeListQuerySchema,
  GraphNodeSchema,
} from '@/knowledge-graph/dto/graph-snapshot.dto';

describe('U8-07 A2 조회 DTO strict 계약', () => {
  it('explore depth와 limit 경계를 강제한다', () => {
    const base = {
      focusKind: 'wiki_document',
      focusId: 'opaque-node',
    };
    expect(
      ExploreQuerySchema.safeParse({ ...base, depth: 1, limit: 1 }).success,
    ).toBe(true);
    expect(
      ExploreQuerySchema.safeParse({ ...base, depth: 2, limit: 100 }).success,
    ).toBe(true);
    expect(ExploreQuerySchema.safeParse({ ...base, depth: 0 }).success).toBe(
      false,
    );
    expect(ExploreQuerySchema.safeParse({ ...base, depth: 3 }).success).toBe(
      false,
    );
    expect(ExploreQuerySchema.safeParse({ ...base, limit: 0 }).success).toBe(
      false,
    );
    expect(ExploreQuerySchema.safeParse({ ...base, limit: 101 }).success).toBe(
      false,
    );
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
    expect(GraphNodeListQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    expect(GraphEdgeListQuerySchema.safeParse({ limit: 0 }).success).toBe(
      false,
    );
  });
});

describe('P9 편집 메타데이터 계약', () => {
  const permissions = {
    canEdit: true,
    canDelete: true,
    canCorrect: false,
    canSuppress: false,
  };

  it('curated 노드 상세는 원본 kind·properties와 edit revision을 함께 준다', () => {
    expect(
      GraphNodeSchema.parse({
        id: 'opaque-node',
        kind: 'curated_node',
        title: '아키텍처',
        factClass: 'user_curated',
        sourceRef: null,
        permissions,
        editTarget: {
          kind: 'curated_node',
          nodeId: '11111111-1111-4111-8111-111111111111',
          revision: 3,
        },
        projectionState: null,
        completeness: 'complete',
        provenance: null,
        curated: { kind: 'concept', properties: { owner: 'platform' } },
      }).curated,
    ).toEqual({ kind: 'concept', properties: { owner: 'platform' } });
  });

  it('curated 관계 상세는 raw endpoint와 properties를 함께 준다', () => {
    expect(
      GraphEdgeSchema.parse({
        id: 'opaque-edge',
        relation: 'curated',
        sourceNodeId: 'opaque-source',
        targetNodeId: 'opaque-target',
        directed: true,
        predicate: 'references',
        factClass: 'user_curated',
        sourceRef: null,
        permissions,
        editTarget: {
          kind: 'curated_edge',
          edgeId: '22222222-2222-4222-8222-222222222222',
          revision: 4,
        },
        projectionState: null,
        completeness: 'complete',
        provenance: null,
        curated: {
          sourceNodeKind: 'curated_node',
          sourceNodeId: '11111111-1111-4111-8111-111111111111',
          targetNodeKind: 'wiki_document',
          targetNodeId: '33333333-3333-4333-8333-333333333333',
          properties: { reason: '설계 근거' },
        },
      }).curated,
    ).toMatchObject({
      sourceNodeKind: 'curated_node',
      targetNodeKind: 'wiki_document',
      properties: { reason: '설계 근거' },
    });
  });
});
