import { wikiKnowledgeGraphStatusLabel } from '@core/features/knowledge-graph/lib/wiki-knowledge-graph-status';

import { describe, expect, it } from '@jest/globals';

describe('Wiki 지식 그래프 상태 표시', () => {
  it('8개 서버 상태를 완료 상태와 구분해 표시한다', () => {
    expect(wikiKnowledgeGraphStatusLabel('not_indexed', false, null)).toBe(
      '색인 전',
    );
    expect(wikiKnowledgeGraphStatusLabel('accepted', false, null)).toBe(
      '갱신 요청됨',
    );
    expect(wikiKnowledgeGraphStatusLabel('queued', false, null)).toBe(
      '갱신 대기 중',
    );
    expect(wikiKnowledgeGraphStatusLabel('running', false, null)).toBe(
      '그래프 갱신 중',
    );
    expect(wikiKnowledgeGraphStatusLabel('waiting', false, null)).toBe(
      '자동 갱신 대기 중',
    );
    expect(wikiKnowledgeGraphStatusLabel('up_to_date', false, null)).toBeNull();
    expect(wikiKnowledgeGraphStatusLabel('stale', false, null)).toBe(
      '갱신 필요',
    );
    expect(
      wikiKnowledgeGraphStatusLabel('failed', false, 'PROVIDER_UNAUTHORIZED'),
    ).toBe('갱신 실패 · PROVIDER_UNAUTHORIZED');
  });

  it('최신 수동 요청이 충족된 경우에만 업데이트 완료라고 표시한다', () => {
    expect(wikiKnowledgeGraphStatusLabel('up_to_date', true, null)).toBe(
      '업데이트 완료',
    );
  });
});
