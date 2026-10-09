import { assertSemanticSearchVectorIndexReady } from '@/knowledge-graph/domain/graph-semantic-search-readiness';

describe('N8-06 vector index readiness 판정', () => {
  it('ONLINE 768차원만 허용한다', () => {
    expect(() =>
      assertSemanticSearchVectorIndexReady([
        { state: 'ONLINE', dimension: 768 },
      ]),
    ).not.toThrow();
  });

  it('ONLINE이 아니거나 차원이 다르면 거부한다', () => {
    for (const row of [
      { state: 'POPULATING', dimension: 768 },
      { state: 'ONLINE', dimension: 3 },
    ])
      expect(() => assertSemanticSearchVectorIndexReady([row])).toThrow(
        expect.objectContaining({ reason: 'KG_VECTOR_INDEX_NOT_READY' }),
      );
  });
});
