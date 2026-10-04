import type {
  ChatConversation,
  ChatMessage,
} from '@repo/client/api-client/schemas';
import { ChatMessageRow } from '@core/features/chat/chat-message-row';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

const actorUserId = 'actor-user';
const peerUserId = 'peer-user';
const conversationId = '11111111-1111-4111-8111-111111111111';

const conversation: ChatConversation = {
  id: conversationId,
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
      userId: peerUserId,
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

function createMessage(senderUserId: string): ChatMessage {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    conversationId,
    senderKind: 'user',
    senderUserId,
    content: { type: 'text', text: '테스트 메시지' },
    referenceKind: null,
    referenceId: null,
    createdAt: '2026-10-04T00:01:00.000Z',
    updatedAt: '2026-10-04T00:01:00.000Z',
    editedAt: null,
  };
}

function createInvitationMessage(): ChatMessage {
  return {
    ...createMessage(peerUserId),
    senderKind: 'system',
    senderUserId: null,
    referenceKind: 'organization_invitation',
    referenceId: 'invitation-a',
    content: {
      type: 'organization_invitation',
      invitationId: 'invitation-a',
      organizationId: 'organization-a',
      inviterUserId: peerUserId,
      organizationNameAtSend: '조직 A',
      inviterDisplayNameAtSend: '초대자',
    },
  };
}

describe('채팅 메시지 행', () => {
  it('링크 버튼은 상세 이동 대신 canonical 링크 복사 동작을 호출한다', async () => {
    const onCopyCanonical = jest.fn();
    await render(
      <ChatMessageRow
        currentUserId={actorUserId}
        focused={false}
        message={createMessage(peerUserId)}
        onCopyCanonical={onCopyCanonical}
        onEdit={jest.fn()}
        onOpenInvitation={jest.fn()}
        sender={conversation.participants[1]}
      />,
    );

    fireEvent.press(screen.getByLabelText('메시지 링크 복사'));

    expect(onCopyCanonical).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('메시지 수정')).toBeNull();
  });

  it('내 일반 텍스트 메시지에는 수정 동작을 노출한다', async () => {
    const onEdit = jest.fn();
    await render(
      <ChatMessageRow
        currentUserId={actorUserId}
        focused={false}
        message={createMessage(actorUserId)}
        onCopyCanonical={jest.fn()}
        onEdit={onEdit}
        onOpenInvitation={jest.fn()}
        sender={conversation.participants[0]}
      />,
    );

    fireEvent.press(screen.getByLabelText('메시지 수정'));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByText('내 메시지')).toBeTruthy();
  });

  it('조직 초대 structured message는 snapshot 카드와 확인 action을 렌더한다', async () => {
    const onOpenInvitation = jest.fn();
    await render(
      <ChatMessageRow
        currentUserId={actorUserId}
        focused={false}
        message={createInvitationMessage()}
        onCopyCanonical={jest.fn()}
        onEdit={jest.fn()}
        onOpenInvitation={onOpenInvitation}
      />,
    );

    expect(screen.getByText('조직 초대')).toBeTruthy();
    expect(
      screen.getByText('초대자님이 조직 A 조직에 초대했습니다.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('메시지 수정')).toBeNull();

    fireEvent.press(screen.getByText('초대 확인'));
    expect(onOpenInvitation).toHaveBeenCalledWith('invitation-a');
  });
});
