import type { TicketDetail } from '@repo/client/api-client/schemas';
import {
  mergeTicketDetailUpdate,
  updateAffectsTicketSummary,
} from '@core/features/projects/lib/ticket-detail-cache';

import { describe, expect, it } from '@jest/globals';

const timestamp = '2026-10-06T00:00:00.000Z';
const reporter = {
  userId: 'reporter',
  name: 'Reporter',
  email: 'reporter@example.com',
  username: null,
  image: null,
};

function makeTicketDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: 'ticket',
    projectId: 'project',
    columnId: 'column',
    number: 1,
    key: 'KAN-1',
    title: '기존 제목',
    priority: 'medium',
    position: 0,
    assignee: null,
    labels: [],
    checklistItemTotal: 0,
    checklistItemCompleted: 0,
    commentCount: 0,
    dueAt: null,
    updatedAt: timestamp,
    descriptionMarkdown: '기존 설명',
    reporter,
    checklists: [],
    comments: [],
    createdAt: timestamp,
    archivedAt: null,
    ...overrides,
  };
}

describe('이슈 상세 cache merge', () => {
  it('ticket PATCH 응답은 반영하되 현재 child resource cache는 보존한다', () => {
    const current = makeTicketDetail({
      labels: [
        {
          id: 'label',
          projectId: 'project',
          name: '버그',
          color: 'red',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      checklists: [
        {
          id: 'checklist',
          ticketId: 'ticket',
          title: '검증',
          position: 0,
          items: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      comments: [
        {
          id: 'comment',
          ticketId: 'ticket',
          contentMarkdown: '최신 댓글',
          author: reporter,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      checklistItemTotal: 3,
      checklistItemCompleted: 2,
      commentCount: 1,
    });
    const incoming = makeTicketDetail({
      title: '수정된 제목',
      descriptionMarkdown: '수정된 설명',
    });

    const merged = mergeTicketDetailUpdate(current, incoming);

    expect(merged.title).toBe('수정된 제목');
    expect(merged.descriptionMarkdown).toBe('수정된 설명');
    expect(merged.labels).toBe(current.labels);
    expect(merged.checklists).toBe(current.checklists);
    expect(merged.comments).toBe(current.comments);
    expect(merged.checklistItemTotal).toBe(3);
    expect(merged.checklistItemCompleted).toBe(2);
    expect(merged.commentCount).toBe(1);
  });

  it('기존 cache가 없으면 server detail을 그대로 사용한다', () => {
    const incoming = makeTicketDetail({ title: '서버 제목' });
    expect(mergeTicketDetailUpdate(undefined, incoming)).toBe(incoming);
  });
});

describe('이슈 summary 영향 판정', () => {
  it('description만 바뀌면 카드 목록 refetch가 필요 없다', () => {
    expect(updateAffectsTicketSummary({ descriptionMarkdown: '새 설명' })).toBe(
      false,
    );
  });

  it.each([
    { title: '새 제목' },
    { priority: 'high' as const },
    { assigneeUserId: null },
    { dueAt: null },
    { archived: true },
  ])('카드 projection 필드 변경은 summary에 영향을 준다: %o', (input) => {
    expect(updateAffectsTicketSummary(input)).toBe(true);
  });
});
