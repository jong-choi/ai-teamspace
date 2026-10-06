import type {
  ProjectColumn,
  TicketSummary,
} from '@repo/client/api-client/schemas';
import {
  formatTicketDueAt,
  sortTicketsForList,
} from '@core/features/projects/lib/ticket-presentation';

import { describe, expect, it } from '@jest/globals';

describe('이슈 표시 모델', () => {
  it('마감일을 Gemini 카드의 YYYY.MM.DD 밀도로 표시한다', () => {
    const localNoon = new Date(2026, 9, 6, 12).toISOString();
    expect(formatTicketDueAt(localNoon)).toBe('2026.10.06');
  });

  it('목록은 컬럼 순서와 컬럼 안 position 순서로 안정적으로 정렬한다', () => {
    const todo = column('11111111-1111-4111-8111-111111111111', 0);
    const doing = column('22222222-2222-4222-8222-222222222222', 1);
    const first = ticket('33333333-3333-4333-8333-333333333333', todo.id, 1);
    const second = ticket('44444444-4444-4444-8444-444444444444', todo.id, 0);
    const third = ticket('55555555-5555-4555-8555-555555555555', doing.id, 0);

    expect(
      sortTicketsForList([third, first, second], [todo, doing]).map(
        ({ id }) => id,
      ),
    ).toEqual([second.id, first.id, third.id]);
  });
});

function column(id: string, position: number): ProjectColumn {
  return {
    id,
    projectId: '77777777-7777-4777-8777-777777777777',
    name: `컬럼 ${position}`,
    position,
    createdAt: '2026-10-06T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
  };
}

function ticket(id: string, columnId: string, position: number): TicketSummary {
  return {
    id,
    projectId: '77777777-7777-4777-8777-777777777777',
    columnId,
    number: position + 1,
    title: '표시 테스트',
    priority: 'medium',
    position,
    key: `OS-${position + 1}`,
    assignee: null,
    labels: [],
    checklistItemTotal: 0,
    checklistItemCompleted: 0,
    commentCount: 0,
    dueAt: null,
    updatedAt: '2026-10-06T00:00:00.000Z',
  };
}
