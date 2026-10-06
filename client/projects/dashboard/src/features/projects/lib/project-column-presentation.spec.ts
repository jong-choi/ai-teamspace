import { getProjectColumnPresentation } from '@core/features/projects/lib/project-column-presentation';

import { describe, expect, it } from '@jest/globals';

describe('프로젝트 컬럼 표시 모델', () => {
  it.each([
    ['Backlog', '백로그', 'bg-zinc-400'],
    ['Todo', '할 일', 'bg-blue-500'],
    ['In Progress', '진행 중', 'bg-amber-500'],
    ['In Review', '검토 중', 'bg-purple-500'],
    ['Done', '완료', 'bg-emerald-500'],
  ])('기본 컬럼 %s를 Gemini 표시로 변환한다', (name, label, dotClassName) => {
    expect(getProjectColumnPresentation(name)).toEqual({ label, dotClassName });
  });

  it('사용자가 이름을 바꾼 컬럼은 그대로 표시한다', () => {
    expect(getProjectColumnPresentation('QA 대기')).toEqual({
      label: 'QA 대기',
      dotClassName: 'bg-muted-foreground/60',
    });
  });
});
