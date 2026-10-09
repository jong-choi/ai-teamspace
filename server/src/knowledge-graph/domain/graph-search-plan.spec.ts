import { planSemanticSearch } from '@/knowledge-graph/domain/graph-search-plan';

describe('U8-05 그래프 검색 계획', () => {
  it('searchable source가 상한 이하면 exact 계획을 선택한다', () => {
    expect(
      planSemanticSearch({
        searchableSourceCount: 2000,
        ennMaxSources: 2000,
        candidateLimit: 40,
      }),
    ).toEqual({ kind: 'exact', candidateLimit: 40 });
  });

  it('searchable source가 상한을 넘으면 bounded ANN overfetch 세 단계만 사용한다', () => {
    expect(
      planSemanticSearch({
        searchableSourceCount: 2001,
        ennMaxSources: 2000,
        candidateLimit: 40,
      }),
    ).toEqual({ kind: 'approximate', overfetchSteps: [100, 400, 1600] });
  });
});
