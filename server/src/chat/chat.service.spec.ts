import type { AuthUserDirectoryService } from '@/auth/auth-user-directory.service';
import { ChatService } from '@/chat/chat.service';
import {
  ChatAccessDeniedError,
  ChatConversationNotFoundError,
  ChatDirectConversationConflictError,
  ChatParticipantUnavailableError,
} from '@/chat/domain/chat.error';
import type { ChatConversation } from '@/chat/domain/chat-conversation';
import type { ChatConversationState } from '@/chat/domain/chat-conversation-state';
import type { ChatMessage } from '@/chat/domain/chat-message';
import { decodeChatMessageCursor } from '@/chat/domain/chat-message-cursor';
import { ChatRepository } from '@/chat/infrastructure/persistence/chat.repository';
import { ChatRealtimeProvider } from '@/chat/infrastructure/realtime/chat-realtime.provider';
import type { OrganizationProvider } from '@/organizations/infrastructure/organization/organization.provider';

import { jest } from '@jest/globals';
import { EMPTY } from 'rxjs';

class FakeChatRepository extends ChatRepository {
  createChannelConversation =
    jest.fn<ChatRepository['createChannelConversation']>();
  createDirectConversation =
    jest.fn<ChatRepository['createDirectConversation']>();
  findDirectByKey = jest.fn<ChatRepository['findDirectByKey']>();
  deliverReferencedSystemMessage =
    jest.fn<ChatRepository['deliverReferencedSystemMessage']>();
  listConversationStates = jest.fn<ChatRepository['listConversationStates']>();
  findConversationState = jest.fn<ChatRepository['findConversationState']>();
  listMessages = jest.fn<ChatRepository['listMessages']>();
  findMessage = jest.fn<ChatRepository['findMessage']>();
  createTextMessage = jest.fn<ChatRepository['createTextMessage']>();
  updateTextMessage = jest.fn<ChatRepository['updateTextMessage']>();
  markRead = jest.fn<ChatRepository['markRead']>();
}

class FakeAuthUserDirectory {
  resolveExactUsername =
    jest.fn<AuthUserDirectoryService['resolveExactUsername']>();
  findByIds = jest.fn<AuthUserDirectoryService['findByIds']>();
}

class FakeOrganizationMembership {
  hasMemberUser = jest.fn<OrganizationProvider['hasMemberUser']>();
}

class FakeChatRealtimeProvider extends ChatRealtimeProvider {
  events = jest.fn<ChatRealtimeProvider['events']>(() => EMPTY);
  publishConversationChanged =
    jest.fn<ChatRealtimeProvider['publishConversationChanged']>();
  publishMessageCreated =
    jest.fn<ChatRealtimeProvider['publishMessageCreated']>();
  publishMessageUpdated =
    jest.fn<ChatRealtimeProvider['publishMessageUpdated']>();
  publishConversationRead =
    jest.fn<ChatRealtimeProvider['publishConversationRead']>();
}

const actorUserId = 'actor-user';
const recipientUserId = 'recipient-user';
const otherUserId = 'other-user';
const conversationId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const olderMessageId = '33333333-3333-4333-8333-333333333333';

function conversation(input: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: conversationId,
    kind: 'direct',
    name: null,
    topic: null,
    directKey: 'direct-key',
    systemUserId: null,
    createdAt: new Date('2026-10-04T00:00:00.000Z'),
    updatedAt: new Date('2026-10-04T00:01:00.000Z'),
    ...input,
  };
}

function message(input: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: messageId,
    conversationId,
    senderKind: 'user',
    senderUserId: actorUserId,
    contentType: 'text',
    content: { text: '안녕하세요' },
    referenceKind: null,
    referenceId: null,
    createdAt: new Date('2026-10-04T00:01:00.000Z'),
    updatedAt: new Date('2026-10-04T00:01:00.000Z'),
    editedAt: null,
    ...input,
  };
}

function state(): ChatConversationState {
  return {
    conversation: conversation(),
    participants: [
      {
        conversationId,
        userId: actorUserId,
        joinedAt: new Date('2026-10-04T00:00:00.000Z'),
        lastReadAt: null,
      },
      {
        conversationId,
        userId: recipientUserId,
        joinedAt: new Date('2026-10-04T00:00:00.000Z'),
        lastReadAt: null,
      },
    ],
    latestMessage: message(),
    unreadCount: 2,
  };
}

function directoryUsers() {
  return [
    {
      id: actorUserId,
      email: 'actor@example.com',
      name: '나',
      username: 'actor',
      image: null,
    },
    {
      id: recipientUserId,
      email: 'recipient@example.com',
      name: '상대',
      username: 'recipient',
      image: null,
    },
  ];
}

describe('채팅 서비스', () => {
  let repository: FakeChatRepository;
  let directory: FakeAuthUserDirectory;
  let realtime: FakeChatRealtimeProvider;
  let organizations: FakeOrganizationMembership;
  let service: ChatService;

  beforeEach(() => {
    repository = new FakeChatRepository();
    directory = new FakeAuthUserDirectory();
    realtime = new FakeChatRealtimeProvider();
    organizations = new FakeOrganizationMembership();
    service = new ChatService(repository, directory, realtime, organizations);
  });

  it('조직 초대는 수신자 system 대화에 참조 기반 structured message로 전달한다', async () => {
    const invitationMessage = message({
      senderKind: 'system',
      senderUserId: null,
      contentType: 'organization_invitation',
      content: {
        type: 'organization_invitation',
        invitationId: 'invitation-a',
        organizationId: 'organization-a',
        inviterUserId: actorUserId,
        organizationNameAtSend: '조직 A',
      },
      referenceKind: 'organization_invitation',
      referenceId: 'invitation-a',
    });
    const systemConversation = conversation({
      kind: 'system',
      directKey: null,
      systemUserId: recipientUserId,
    });
    repository.deliverReferencedSystemMessage.mockResolvedValue({
      conversation: systemConversation,
      conversationCreated: true,
      message: invitationMessage,
      messageCreated: true,
    });

    await expect(
      service.deliverOrganizationInvitation({
        recipientUserId,
        invitationId: 'invitation-a',
        organizationId: 'organization-a',
        inviterUserId: actorUserId,
        organizationNameAtSend: '조직 A',
      }),
    ).resolves.toMatchObject({
      content: { type: 'organization_invitation' },
      referenceId: 'invitation-a',
    });

    expect(repository.deliverReferencedSystemMessage).toHaveBeenCalledWith(
      recipientUserId,
      {
        contentType: 'organization_invitation',
        content: {
          type: 'organization_invitation',
          invitationId: 'invitation-a',
          organizationId: 'organization-a',
          inviterUserId: actorUserId,
          organizationNameAtSend: '조직 A',
        },
      },
      'organization_invitation',
      'invitation-a',
    );
    expect(realtime.publishConversationChanged).toHaveBeenCalledWith(
      [recipientUserId],
      conversationId,
    );
    expect(realtime.publishMessageCreated).toHaveBeenCalledWith(
      [recipientUserId],
      expect.objectContaining({ id: messageId }),
    );
  });

  it('조직 초대 realtime 발행 실패는 durable delivery 성공을 뒤집지 않는다', async () => {
    repository.deliverReferencedSystemMessage.mockResolvedValue({
      conversation: conversation({
        kind: 'system',
        directKey: null,
        systemUserId: recipientUserId,
      }),
      conversationCreated: false,
      message: message({
        senderKind: 'system',
        senderUserId: null,
        contentType: 'organization_invitation',
        content: {
          type: 'organization_invitation',
          invitationId: 'invitation-a',
          organizationId: 'organization-a',
          inviterUserId: actorUserId,
        },
        referenceKind: 'organization_invitation',
        referenceId: 'invitation-a',
      }),
      messageCreated: true,
    });
    realtime.publishMessageCreated.mockRejectedValue(new Error('redis down'));

    await expect(
      service.deliverOrganizationInvitation({
        recipientUserId,
        invitationId: 'invitation-a',
        organizationId: 'organization-a',
        inviterUserId: actorUserId,
      }),
    ).resolves.toMatchObject({ referenceId: 'invitation-a' });
  });

  it('조직 초대 resend는 기존 durable message를 중복 저장하지 않고 realtime만 다시 알린다', async () => {
    repository.deliverReferencedSystemMessage.mockResolvedValue({
      conversation: conversation({
        kind: 'system',
        directKey: null,
        systemUserId: recipientUserId,
      }),
      conversationCreated: false,
      message: message({
        senderKind: 'system',
        senderUserId: null,
        contentType: 'organization_invitation',
        content: {
          type: 'organization_invitation',
          invitationId: 'invitation-a',
          organizationId: 'organization-a',
          inviterUserId: actorUserId,
        },
        referenceKind: 'organization_invitation',
        referenceId: 'invitation-a',
      }),
      messageCreated: false,
    });

    await service.deliverOrganizationInvitation({
      recipientUserId,
      invitationId: 'invitation-a',
      organizationId: 'organization-a',
      inviterUserId: actorUserId,
      republishExistingMessage: true,
    });

    expect(realtime.publishMessageCreated).toHaveBeenCalledWith(
      [recipientUserId],
      expect.objectContaining({ id: messageId }),
    );
  });

  it('대화 목록은 사이드바에 필요한 참가자, 읽지 않은 수, 최근 메시지를 함께 반환한다', async () => {
    repository.listConversationStates.mockResolvedValue([state()]);
    directory.findByIds.mockResolvedValue(directoryUsers());

    await expect(service.listConversations(actorUserId)).resolves.toMatchObject(
      {
        items: [
          {
            id: conversationId,
            kind: 'direct',
            unreadCount: 2,
            participants: [
              { userId: actorUserId, username: 'actor' },
              { userId: recipientUserId, username: 'recipient' },
            ],
            latestMessage: {
              id: messageId,
              content: { type: 'text', text: '안녕하세요' },
            },
          },
        ],
      },
    );
  });

  it('참가자가 아닌 사용자의 메시지 전송은 영속성 변경 전에 차단한다', async () => {
    repository.findConversationState.mockResolvedValue(null);

    await expect(
      service.sendMessage(actorUserId, conversationId, {
        text: '차단되어야 함',
      }),
    ).rejects.toBeInstanceOf(ChatConversationNotFoundError);
    expect(repository.createTextMessage).not.toHaveBeenCalled();
  });

  it('다른 사용자의 일반 메시지는 수정할 수 없다', async () => {
    repository.findMessage.mockResolvedValue(
      message({ senderUserId: otherUserId }),
    );

    await expect(
      service.updateMessage(actorUserId, conversationId, messageId, {
        text: '수정 시도',
      }),
    ).rejects.toBeInstanceOf(ChatAccessDeniedError);
    expect(repository.updateTextMessage).not.toHaveBeenCalled();
  });

  it('동일한 일대일 대화가 있으면 새 행을 만들지 않고 기존 대화를 반환한다', async () => {
    directory.resolveExactUsername.mockResolvedValue({
      id: recipientUserId,
      email: 'recipient@example.com',
      name: '상대',
      username: 'recipient',
      image: null,
    });
    repository.findDirectByKey.mockResolvedValue(conversation());
    repository.findConversationState.mockResolvedValue(state());
    directory.findByIds.mockResolvedValue(directoryUsers());

    const result = await service.createDirect(actorUserId, {
      recipientUsername: 'recipient',
    });

    expect(result.id).toBe(conversationId);
    expect(repository.createChannelConversation).not.toHaveBeenCalled();
  });

  it('활성 조직의 멤버는 user ID로 일대일 대화를 열 수 있다', async () => {
    organizations.hasMemberUser.mockResolvedValue(true);
    repository.findDirectByKey.mockResolvedValue(conversation());
    repository.findConversationState.mockResolvedValue(state());
    directory.findByIds.mockResolvedValue(directoryUsers());

    const result = await service.createDirect(
      actorUserId,
      { recipientUserId },
      'organization-a',
    );

    expect(result.id).toBe(conversationId);
    expect(organizations.hasMemberUser).toHaveBeenCalledWith(
      'organization-a',
      recipientUserId,
    );
    expect(directory.resolveExactUsername).not.toHaveBeenCalled();
  });

  it('같은 활성 조직 멤버가 아닌 user ID로는 일대일 대화를 열 수 없다', async () => {
    organizations.hasMemberUser.mockImplementation((_organizationId, userId) =>
      Promise.resolve(userId === actorUserId),
    );

    await expect(
      service.createDirect(actorUserId, { recipientUserId }, 'organization-a'),
    ).rejects.toBeInstanceOf(ChatDirectConversationConflictError);
    await expect(
      service.createDirect(actorUserId, { recipientUserId }),
    ).rejects.toBeInstanceOf(ChatDirectConversationConflictError);
    expect(repository.createDirectConversation).not.toHaveBeenCalled();
  });

  it('채널 참여자 user ID는 활성 조직 멤버일 때만 추가한다', async () => {
    organizations.hasMemberUser.mockResolvedValue(true);
    repository.createChannelConversation.mockResolvedValue(
      conversation({ kind: 'channel', name: 'general', directKey: null }),
    );
    repository.findConversationState.mockResolvedValue(state());
    directory.findByIds.mockResolvedValue(directoryUsers());

    await service.createChannel(
      actorUserId,
      { name: 'general', participantUserIds: [recipientUserId] },
      'organization-a',
    );

    expect(repository.createChannelConversation).toHaveBeenCalledWith(
      expect.anything(),
      [actorUserId, recipientUserId],
    );

    organizations.hasMemberUser.mockResolvedValue(false);
    await expect(
      service.createChannel(
        actorUserId,
        { name: 'general', participantUserIds: [otherUserId] },
        'organization-a',
      ),
    ).rejects.toBeInstanceOf(ChatParticipantUnavailableError);
  });

  it('일대일 대화 동시 생성 충돌 뒤에는 고유 제약으로 생성된 기존 대화를 재조회한다', async () => {
    directory.resolveExactUsername.mockResolvedValue({
      id: recipientUserId,
      email: 'recipient@example.com',
      name: '상대',
      username: 'recipient',
      image: null,
    });
    repository.findDirectByKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(conversation());
    repository.createDirectConversation.mockResolvedValue(null);
    repository.findConversationState.mockResolvedValue(state());
    directory.findByIds.mockResolvedValue(directoryUsers());

    await expect(
      service.createDirect(actorUserId, { recipientUsername: 'recipient' }),
    ).resolves.toMatchObject({ id: conversationId });
    expect(repository.findDirectByKey).toHaveBeenCalledTimes(2);
  });

  it('일대일 대화 생성 중 일반 영속성 오류를 충돌 오류로 변환하지 않는다', async () => {
    const persistenceError = new Error('database unavailable');
    directory.resolveExactUsername.mockResolvedValue({
      id: recipientUserId,
      email: 'recipient@example.com',
      name: '상대',
      username: 'recipient',
      image: null,
    });
    repository.findDirectByKey.mockResolvedValue(null);
    repository.createDirectConversation.mockRejectedValue(persistenceError);

    await expect(
      service.createDirect(actorUserId, { recipientUsername: 'recipient' }),
    ).rejects.toBe(persistenceError);
    expect(repository.findDirectByKey).toHaveBeenCalledTimes(1);
  });

  it('메시지 이력의 다음 커서는 반환 페이지에서 가장 오래된 메시지를 가리킨다', async () => {
    const oldest = message({
      id: olderMessageId,
      createdAt: new Date('2026-10-03T23:59:00.000Z'),
      updatedAt: new Date('2026-10-03T23:59:00.000Z'),
    });
    repository.listMessages.mockResolvedValue({
      items: [oldest, message()],
      hasMore: true,
    });

    const result = await service.listMessages(actorUserId, conversationId, {
      limit: 2,
    });

    expect(result.nextCursor).not.toBeNull();
    expect(decodeChatMessageCursor(result.nextCursor!)).toEqual({
      createdAt: oldest.createdAt,
      id: oldest.id,
    });
  });
});
