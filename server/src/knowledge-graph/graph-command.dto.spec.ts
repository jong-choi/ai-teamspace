import {
  KnowledgeGraphCorrectionNotActiveError,
  KnowledgeGraphCorrectionNotFoundError,
  KnowledgeGraphCorrectionTargetAmbiguousError,
  KnowledgeGraphCuratedEdgeNotFoundError,
  KnowledgeGraphCuratedNodeNotFoundError,
} from '@/knowledge-graph/domain/graph-command.error';
import {
  CreateCuratedNodeCommandSchema,
  CuratedEndpointOptionsQuerySchema,
  CuratedGraphNodeCommandResultSchema,
  UpdateCuratedNodeCommandSchema,
} from '@/knowledge-graph/dto/curated-graph-command.dto';
import {
  CreateSemanticCorrectionCommandSchema,
  SemanticCorrectionCommandResultSchema,
  UpdateSemanticCorrectionCommandSchema,
} from '@/knowledge-graph/dto/semantic-correction-command.dto';

describe('U8-07 그래프 명령 DTO strict 계약', () => {
  it('curated 명령은 추가 필드를 거부하고 expectedRevision을 정수로 검증한다', () => {
    expect(
      CreateCuratedNodeCommandSchema.safeParse({
        kind: 'custom',
        title: '노드',
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      UpdateCuratedNodeCommandSchema.parse({
        title: '수정',
        expectedRevision: '2',
      }),
    ).toMatchObject({ title: '수정', expectedRevision: 2 });
    expect(
      UpdateCuratedNodeCommandSchema.safeParse({
        title: '수정',
        expectedRevision: -1,
      }).success,
    ).toBe(false);
  });

  it('endpoint 후보 query는 kind를 검증하고 최대 20개까지만 허용한다', () => {
    expect(CuratedEndpointOptionsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(
      CuratedEndpointOptionsQuerySchema.parse({
        kind: 'wiki_document',
        limit: '20',
      }),
    ).toEqual({ kind: 'wiki_document', limit: 20 });
    expect(
      CuratedEndpointOptionsQuerySchema.safeParse({ limit: 21 }).success,
    ).toBe(false);
    expect(
      CuratedEndpointOptionsQuerySchema.safeParse({ kind: 'member' }).success,
    ).toBe(false);
  });

  it('보정 create는 action별 target과 value 조합을 강제한다', () => {
    expect(
      CreateSemanticCorrectionCommandSchema.safeParse({
        action: 'label_override',
        nodeId: 'semantic-node',
      }).success,
    ).toBe(false);
    expect(
      CreateSemanticCorrectionCommandSchema.safeParse({
        action: 'suppress',
        nodeId: 'semantic-node',
        edgeId: 'semantic-edge',
      }).success,
    ).toBe(false);
    expect(
      CreateSemanticCorrectionCommandSchema.safeParse({
        action: 'correct_predicate',
        edgeId: 'semantic-edge',
        value: { predicate: 'NOT_IN_ONTOLOGY' },
      }).success,
    ).toBe(false);
    expect(
      CreateSemanticCorrectionCommandSchema.safeParse({
        action: 'label_override',
        nodeId: 'semantic-node',
        value: { label: '새 이름' },
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      CreateSemanticCorrectionCommandSchema.parse({
        action: 'correct_predicate',
        edgeId: 'semantic-edge',
        value: { predicate: 'USES' },
      }),
    ).toEqual({
      action: 'correct_predicate',
      edgeId: 'semantic-edge',
      value: { predicate: 'USES' },
    });
  });

  it('보정 PATCH는 label value만 받고 추가 필드를 거부한다', () => {
    expect(
      UpdateSemanticCorrectionCommandSchema.parse({
        value: { label: '교정된 이름' },
      }),
    ).toEqual({ value: { label: '교정된 이름' } });
    expect(
      UpdateSemanticCorrectionCommandSchema.safeParse({
        value: { label: '교정된 이름' },
        action: 'label_override',
      }).success,
    ).toBe(false);
    expect(
      UpdateSemanticCorrectionCommandSchema.safeParse({
        value: { predicate: 'USES' },
      }).success,
    ).toBe(false);
  });

  it('wire 응답은 ISO timestamp·pending projection과 보정 결과 필드를 강제한다', () => {
    expect(
      CuratedGraphNodeCommandResultSchema.safeParse({
        id: '1d154d50-73bf-4c74-a21d-e1edfa303c79',
        kind: 'custom',
        title: '노드',
        properties: {},
        revision: 1,
        updatedAt: '2026-10-09T00:00:00.000Z',
        projectionState: 'pending',
      }).success,
    ).toBe(true);
    expect(
      SemanticCorrectionCommandResultSchema.safeParse({
        correctionId: '4aa84ef6-c16d-4dc9-9b3b-d76728224079',
        linkedCorrectionId: null,
        action: 'label_override',
        editRevision: 1,
        matchState: 'matched',
      }).success,
    ).toBe(true);
  });
});

describe('U8-08 그래프 명령 오류 코드', () => {
  it.each([
    [
      new KnowledgeGraphCorrectionTargetAmbiguousError(),
      'KG_CORRECTION_TARGET_AMBIGUOUS',
      'conflict',
    ],
    [
      new KnowledgeGraphCorrectionNotActiveError(),
      'KG_CORRECTION_NOT_ACTIVE',
      'conflict',
    ],
    [
      new KnowledgeGraphCorrectionNotFoundError(),
      'KG_CORRECTION_NOT_FOUND',
      'not_found',
    ],
    [
      new KnowledgeGraphCuratedNodeNotFoundError(),
      'KG_CURATED_NODE_NOT_FOUND',
      'not_found',
    ],
    [
      new KnowledgeGraphCuratedEdgeNotFoundError(),
      'KG_CURATED_EDGE_NOT_FOUND',
      'not_found',
    ],
  ] as const)('%s는 고정 오류 코드와 kind를 유지한다', (error, code, kind) => {
    expect(error).toMatchObject({ code, kind });
  });
});
