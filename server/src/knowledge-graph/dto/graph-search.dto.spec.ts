import { SearchQuerySchema } from '@/knowledge-graph/dto/graph-search.dto';

describe('U8-07 그래프 검색 DTO strict', () => {
  it('기본 mode와 limit을 적용한다', () => {
    expect(SearchQuerySchema.parse({ q: '  검색어  ' })).toEqual({
      q: '검색어',
      mode: 'hybrid',
      limit: 5,
    });
  });

  it('허용하지 않은 cypher·label·model 필드를 거부한다', () => {
    for (const extra of [
      { cypher: 'MATCH (n) RETURN n' },
      { label: 'KGSemanticChunk' },
      { model: 'other-model' },
    ]) {
      expect(() =>
        SearchQuerySchema.parse({ q: '검색어', ...extra }),
      ).toThrow();
    }
  });

  it('mode와 limit 범위를 강제한다', () => {
    expect(() =>
      SearchQuerySchema.parse({ q: '검색어', mode: 'raw' }),
    ).toThrow();
    expect(() => SearchQuerySchema.parse({ q: '검색어', limit: 0 })).toThrow();
    expect(() => SearchQuerySchema.parse({ q: '검색어', limit: 21 })).toThrow();
    expect(() => SearchQuerySchema.parse({ q: '   ' })).toThrow();
  });
});
