import type {
  TicketList,
  TicketSummary,
} from '@repo/client/api-client/schemas';
import {
  applyCanonicalTicketMove,
  applyOptimisticTicketMove,
} from '@core/features/projects/lib/kanban-cache';

import { describe, expect, it } from '@jest/globals';

const todoColumnId = '11111111-1111-4111-8111-111111111111';
const doingColumnId = '22222222-2222-4222-8222-222222222222';
const firstTicket = ticket(
  '33333333-3333-4333-8333-333333333333',
  todoColumnId,
  0,
);
const secondTicket = ticket(
  '44444444-4444-4444-8444-444444444444',
  todoColumnId,
  1,
);
const thirdTicket = ticket(
  '55555555-5555-4555-8555-555555555555',
  todoColumnId,
  2,
);
const doingTicket = ticket(
  '66666666-6666-4666-8666-666666666666',
  doingColumnId,
  0,
);
const list: TicketList = {
  items: [firstTicket, secondTicket, thirdTicket, doingTicket],
};

describe('칸반 optimistic 캐시', () => {
  it('같은 컬럼에서 기준 티켓 앞으로 이동하면 연속 position을 다시 만든다', () => {
    const moved = applyOptimisticTicketMove(
      list,
      thirdTicket.id,
      {
        targetColumnId: todoColumnId,
        beforeTicketId: firstTicket.id,
        afterTicketId: null,
      },
      {},
    );

    expect(
      moved.items
        .filter(({ columnId }) => columnId === todoColumnId)
        .sort((left, right) => left.position - right.position)
        .map(({ id, position }) => ({ id, position })),
    ).toEqual([
      { id: thirdTicket.id, position: 0 },
      { id: firstTicket.id, position: 1 },
      { id: secondTicket.id, position: 2 },
    ]);
  });

  it('다른 컬럼 끝으로 이동하면 source와 target 순서를 함께 정규화한다', () => {
    const moved = applyOptimisticTicketMove(
      list,
      firstTicket.id,
      {
        targetColumnId: doingColumnId,
        beforeTicketId: null,
        afterTicketId: null,
      },
      {},
    );

    expect(orderForColumn(moved, todoColumnId)).toEqual([
      { id: secondTicket.id, position: 0 },
      { id: thirdTicket.id, position: 1 },
    ]);
    expect(orderForColumn(moved, doingColumnId)).toEqual([
      { id: doingTicket.id, position: 0 },
      { id: firstTicket.id, position: 1 },
    ]);
  });

  it('컬럼 필터 밖으로 이동한 이슈는 현재 query 캐시에서 제거한다', () => {
    const filtered: TicketList = {
      items: [firstTicket, secondTicket, thirdTicket],
    };
    const moved = applyOptimisticTicketMove(
      filtered,
      secondTicket.id,
      {
        targetColumnId: doingColumnId,
        beforeTicketId: null,
        afterTicketId: null,
      },
      { columnId: todoColumnId },
    );

    expect(moved.items.map(({ id }) => id)).toEqual([
      firstTicket.id,
      thirdTicket.id,
    ]);
    expect(moved.items.map(({ position }) => position)).toEqual([0, 1]);
  });

  it('서버 canonical 결과는 해당 이슈의 column position updatedAt만 교체한다', () => {
    const canonical = applyCanonicalTicketMove(list, {
      ticketId: firstTicket.id,
      columnId: doingColumnId,
      position: 3,
      updatedAt: '2026-10-06T00:10:00.000Z',
    });

    expect(
      canonical?.items.find(({ id }) => id === firstTicket.id),
    ).toMatchObject({
      columnId: doingColumnId,
      position: 3,
      updatedAt: '2026-10-06T00:10:00.000Z',
    });
    expect(canonical?.items.find(({ id }) => id === secondTicket.id)).toBe(
      secondTicket,
    );
  });
});

function orderForColumn(value: TicketList, columnId: string) {
  return value.items
    .filter((ticket) => ticket.columnId === columnId)
    .sort((left, right) => left.position - right.position)
    .map(({ id, position }) => ({ id, position }));
}

function ticket(id: string, columnId: string, position: number): TicketSummary {
  return {
    id,
    projectId: '77777777-7777-4777-8777-777777777777',
    columnId,
    number: position + 1,
    title: `테스트 이슈 ${position + 1}`,
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
