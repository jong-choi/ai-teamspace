import { applyGraphCorrectionOverlay } from '@/knowledge-graph/domain/graph-overlay';

const fingerprint = 'f'.repeat(64);
const entity = (
  key: string,
  name: string,
  evidence: string,
  occurrence = 1,
) => ({
  key: key.repeat(64),
  localId: name,
  anchor: {
    v: 1 as const,
    entityType: 'Person' as const,
    normalizedName: name.toLocaleLowerCase('ko'),
    evidenceDigest: evidence.repeat(64),
    occurrence,
    extractorFingerprint: fingerprint,
  },
});

describe('U8-10 지식 그래프 보정 overlay', () => {
  const alpha = entity('1', '알파', 'a');
  const beta = entity('2', '베타', 'b');
  const relation = {
    key: '3'.repeat(64),
    sourceKey: alpha.key,
    targetKey: beta.key,
    anchor: {
      v: 1 as const,
      source: alpha.anchor,
      target: beta.anchor,
      predicate: 'USES' as const,
    },
  };
  const graph = {
    entities: [alpha, beta],
    relations: [relation],
  };
  const base = {
    id: '10000000-0000-4000-8000-000000000001',
    organizationId: 'org-a',
    sourceKind: 'wiki_document' as const,
    sourceId: '10000000-0000-4000-8000-000000000002',
    correctionTargetId: 'd'.repeat(64),
    targetKind: 'entity' as const,
    status: 'active' as const,
    createdRevision: 1,
    cancelledRevision: null,
    createdByUserId: 'actor-a',
    cancelledByUserId: null,
    createdAt: new Date(0),
    cancelledAt: null,
    lastMatchState: null,
    lastMatchedGenerationId: null,
    lastMatchedAt: null,
    linkedCorrectionId: null,
  };

  it('suppress entity는 해당 entity와 incident relation을 함께 제거한다', () => {
    const result = applyGraphCorrectionOverlay(graph, [
      {
        ...base,
        action: 'suppress',
        anchor: alpha.anchor,
        value: null,
      },
    ]);

    expect(result.entities.map((row) => row.key)).toEqual([beta.key]);
    expect(result.relations).toEqual([]);
  });

  it('label override는 표시 이름만 바꾸고 원래 anchor와 localId를 보존한다', () => {
    const result = applyGraphCorrectionOverlay(graph, [
      {
        ...base,
        action: 'label_override',
        anchor: alpha.anchor,
        value: { label: '알파 수정' },
      },
    ]);

    expect(result.entities[0]).toMatchObject({
      localId: '알파',
      displayName: '알파 수정',
      anchor: { normalizedName: '알파' },
    });
  });

  it('pending과 ambiguous anchor는 원본 그래프에 적용하지 않는다', () => {
    const pending = {
      ...base,
      action: 'label_override' as const,
      anchor: {
        ...alpha.anchor,
        evidenceDigest: 'c'.repeat(64),
      },
      value: { label: '적용 금지' },
    };
    const ambiguousGraph = {
      ...graph,
      entities: [alpha, { ...alpha, key: '4'.repeat(64) }, beta],
    };
    const ambiguous = {
      ...base,
      id: '10000000-0000-4000-8000-000000000003',
      action: 'label_override' as const,
      anchor: alpha.anchor,
      value: { label: '모호 적용 금지' },
    };

    const pendingResult = applyGraphCorrectionOverlay(graph, [pending]);
    const ambiguousResult = applyGraphCorrectionOverlay(ambiguousGraph, [
      ambiguous,
    ]);

    expect(pendingResult.entities[0]?.displayName).toBe('알파');
    expect(ambiguousResult.entities[0]?.displayName).toBe('알파');
    expect(ambiguousResult.entities[1]?.displayName).toBe('알파');
  });
});
