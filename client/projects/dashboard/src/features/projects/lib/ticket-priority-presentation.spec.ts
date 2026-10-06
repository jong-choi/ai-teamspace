import {
  getTicketPriorityPresentation,
  TICKET_PRIORITY_OPTIONS,
} from '@core/features/projects/lib/ticket-priority-presentation';

import { describe, expect, it } from '@jest/globals';

describe('이슈 우선순위 표시 모델', () => {
  it('필터와 편집 UI가 같은 우선순위 순서와 한글 라벨을 사용한다', () => {
    expect(TICKET_PRIORITY_OPTIONS).toEqual([
      { value: 'urgent', label: '긴급' },
      { value: 'high', label: '높음' },
      { value: 'medium', label: '보통' },
      { value: 'low', label: '낮음' },
    ]);
  });

  it('카드 badge와 목록 icon의 Gemini 색 계층을 각각 유지한다', () => {
    const urgent = getTicketPriorityPresentation('urgent');
    expect(urgent.badgeForegroundClass).toContain('text-red-600');
    expect(urgent.listForegroundClass).toBe('text-red-500');

    const low = getTicketPriorityPresentation('low');
    expect(low.badgeForegroundClass).toBe('text-muted-foreground');
    expect(low.listForegroundClass).toBe('text-muted-foreground');
  });
});
