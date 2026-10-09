import {
  buildPlainTextExcerpt,
  foldSemanticHitsBySource,
  fuseSearchCandidates,
} from '@/knowledge-graph/domain/graph-search-fusion';

describe('U8-04 그래프 검색 RRF', () => {
  it('semantic과 keyword 순위를 reciprocal rank fusion으로 합산한다', () => {
    const fused = fuseSearchCandidates({
      limit: 10,
      semantic: [
        {
          sourceId: 'source-a',
          score: 0.9,
          chunkIndex: 0,
          generationId: '00000000-0000-0000-0000-000000000001',
          text: 'alpha',
          indexedSourceUpdatedAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          sourceId: 'source-b',
          score: 0.99,
          chunkIndex: 0,
          generationId: '00000000-0000-0000-0000-000000000002',
          text: 'beta',
          indexedSourceUpdatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      keyword: [
        { sourceId: 'source-b', matchedIn: ['title'] },
        { sourceId: 'source-c', matchedIn: ['content'] },
      ],
    });

    expect(fused.map((candidate) => candidate.sourceId)).toEqual([
      'source-b',
      'source-a',
      'source-c',
    ]);
    expect(fused[0]).toMatchObject({ semanticRank: 2, keywordRank: 1 });
  });

  it('같은 source의 semantic hit은 최고 점수 chunk 하나로 접는다', () => {
    const folded = foldSemanticHitsBySource([
      {
        sourceId: 'source-a',
        score: 0.1,
        chunkIndex: 0,
        generationId: '00000000-0000-0000-0000-000000000001',
        text: 'old',
        indexedSourceUpdatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        sourceId: 'source-a',
        score: 0.9,
        chunkIndex: 1,
        generationId: '00000000-0000-0000-0000-000000000001',
        text: 'new',
        indexedSourceUpdatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    expect(folded).toHaveLength(1);
    expect(folded[0]?.chunkIndex).toBe(1);
  });
});

describe('U8-12 그래프 검색 excerpt', () => {
  it('Markdown 장식을 제거하고 query 주변의 plain text를 제한 길이로 자른다', () => {
    const excerpt = buildPlainTextExcerpt({
      text:
        '# 제목\n\n앞 내용 '.repeat(30) + '**핵심질문** 뒤 내용 '.repeat(30),
      query: '핵심질문',
      maxLength: 80,
    });

    expect(excerpt).toContain('핵심질문');
    expect(excerpt).not.toContain('**');
    expect(excerpt?.length).toBeLessThanOrEqual(80);
  });
});
