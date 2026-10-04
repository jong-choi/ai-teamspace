import type { ChatConversation } from '@repo/client/api-client/schemas';
import { getConversationDisplay } from '@core/features/chat/chat-presenter';

import { describe, expect, it } from '@jest/globals';

const actorUserId = 'actor-user';
const conversation: ChatConversation = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'direct',
  name: null,
  topic: null,
  participants: [
    {
      userId: actorUserId,
      name: '나',
      username: 'me',
      image: null,
      joinedAt: '2026-10-04T00:00:00.000Z',
      lastReadAt: null,
    },
    {
      userId: 'peer-user',
      name: '상대방',
      username: 'peer',
      image: null,
      joinedAt: '2026-10-04T00:00:00.000Z',
      lastReadAt: null,
    },
  ],
  unreadCount: 0,
  latestMessage: null,
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
};

describe('채팅 표시 규칙', () => {
  it('다이렉트 메시지 제목은 현재 사용자가 아니라 상대방을 표시한다', () => {
    expect(getConversationDisplay(conversation, actorUserId)).toMatchObject({
      title: '상대방',
      subtitle: '@peer',
    });
  });

  it('상대가 사라진 다이렉트 메시지를 현재 사용자 이름으로 오인하지 않는다', () => {
    expect(
      getConversationDisplay(
        { ...conversation, participants: [conversation.participants[0]!] },
        actorUserId,
      ),
    ).toMatchObject({
      title: '대화 상대 없음',
    });
  });

  it('시스템 대화를 다이렉트 메시지로 오인하지 않는다', () => {
    expect(
      getConversationDisplay(
        {
          ...conversation,
          kind: 'system',
          name: null,
          topic: null,
          participants: [conversation.participants[0]!],
        },
        actorUserId,
      ),
    ).toEqual({
      title: '시스템',
      subtitle: '시스템 알림과 메시지',
      image: null,
    });
  });
});
