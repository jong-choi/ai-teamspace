import {
  applySemanticCorrections,
  matchSemanticCorrection,
  matchSemanticCorrectionRecord,
} from '@/knowledge-graph/domain/semantic-correction';

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

describe('의미 보정 anchor 매칭과 최신 overlay', () => {
  const jiyoon = entity('1', '지윤', 'a');
  const minsu = entity('2', '민수', 'b');
  const relation = {
    key: '3'.repeat(64),
    sourceKey: jiyoon.key,
    targetKey: minsu.key,
    anchor: {
      v: 1 as const,
      source: jiyoon.anchor,
      target: minsu.anchor,
      predicate: 'USES' as const,
    },
  };
  const graph = { entities: [jiyoon, minsu], relations: [relation] };

  it('U7-31 동명 한 명이어도 evidence·occurrence·extractor가 모두 맞아야 적용한다', () => {
    expect(matchSemanticCorrection(jiyoon.anchor, graph)).toEqual({
      state: 'matched',
      targetKey: jiyoon.key,
    });
    expect(
      matchSemanticCorrection(
        { ...jiyoon.anchor, evidenceDigest: 'c'.repeat(64) },
        graph,
      ),
    ).toEqual({ state: 'pending_review' });
    expect(
      matchSemanticCorrection(jiyoon.anchor, {
        ...graph,
        entities: [jiyoon, { ...jiyoon, key: '4'.repeat(64) }],
      }),
    ).toEqual({ state: 'ambiguous_review', targetKey: undefined });
  });

  it('U7-31 관계는 양끝 anchor와 predicate가 각각 유일할 때만 매칭한다', () => {
    expect(matchSemanticCorrection(relation.anchor, graph)).toEqual({
      state: 'matched',
      targetKey: relation.key,
    });
    expect(
      matchSemanticCorrection(
        { ...relation.anchor, predicate: 'DEPENDS_ON' },
        graph,
      ),
    ).toEqual({ state: 'pending_review', targetKey: undefined });
  });

  it('U7-31 suppress·label override·asserted relation을 원본 provenance와 분리해 적용한다', () => {
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
    const corrections = [
      {
        ...base,
        action: 'label_override',
        anchor: jiyoon.anchor,
        value: { label: '지윤 수정' },
      },
      {
        ...base,
        id: '10000000-0000-4000-8000-000000000003',
        action: 'suppress',
        anchor: relation.anchor,
        targetKind: 'relation',
        value: null,
      },
      {
        ...base,
        id: '10000000-0000-4000-8000-000000000004',
        action: 'asserted_relation',
        anchor: { ...relation.anchor, predicate: 'RELATED_TO' },
        targetKind: 'relation',
        value: {
          predicate: 'RELATED_TO',
          source: jiyoon.anchor,
          target: minsu.anchor,
        },
      },
    ] as const;
    const result = applySemanticCorrections(graph, corrections);
    expect(result.entities[0]).toMatchObject({
      localId: '지윤',
      displayName: '지윤 수정',
      factClass: 'extracted',
    });
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]).toMatchObject({
      anchor: { predicate: 'RELATED_TO' },
      factClass: 'user_curated',
    });
    expect(matchSemanticCorrectionRecord(corrections[2], graph)).toEqual({
      state: 'matched',
    });
  });
});
