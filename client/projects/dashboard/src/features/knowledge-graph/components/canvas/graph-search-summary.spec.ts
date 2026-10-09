import { semanticRecallLabel } from '@core/features/knowledge-graph/components/canvas/graph-search-summary';

import { describe, expect, it } from '@jest/globals';

describe('지식 그래프 검색 품질 표시', () => {
  it('recall 수준을 사용자에게 구분해 표시한다', () => {
    expect(semanticRecallLabel('exact')).toBe('의미 검색 정확');
    expect(semanticRecallLabel('approximate')).toBe('의미 검색 근사');
    expect(semanticRecallLabel(null)).toBe('키워드 검색');
  });
});
