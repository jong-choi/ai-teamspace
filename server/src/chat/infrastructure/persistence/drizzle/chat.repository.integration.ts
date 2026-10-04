import { Test, type TestingModule } from '@nestjs/testing';

import { user } from '#server-source/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { ChatRepository } from '#server-source/chat/infrastructure/persistence/chat.repository';
import { ChatDrizzlePersistenceModule } from '#server-source/chat/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { chatConversation } from '#server-source/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema';
import { chatMessage } from '#server-source/chat/infrastructure/persistence/drizzle/schema/chat-message.schema';
import { DatabaseModule } from '#server-source/database/database.module';
import { DatabaseService } from '#server-source/database/database.service';

import { inArray } from 'drizzle-orm';

const actorUserId = 'chat-repository-actor';
const recipientUserId = 'chat-repository-recipient';
const outsiderUserId = 'chat-repository-outsider';
const userIds = [actorUserId, recipientUserId, outsiderUserId] as const;

const firstMessageId = '11111111-1111-4111-8111-111111111111';
const secondMessageId = '22222222-2222-4222-8222-222222222222';
const thirdMessageId = '33333333-3333-4333-8333-333333333333';

describe('채팅 Drizzle 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let repository: ChatRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, ChatDrizzlePersistenceModule],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    repository = moduleRef.get(ChatRepository);
  });

  beforeEach(async () => {
    await database.delete(chatConversation);
    await database.delete(user).where(inArray(user.id, userIds));
    await database.insert(user).values([
      {
        id: actorUserId,
        name: '채팅 저장소 사용자',
        email: 'chat-repository-actor@example.com',
        username: 'chatrepositoryactor',
      },
      {
        id: recipientUserId,
        name: '채팅 저장소 상대',
        email: 'chat-repository-recipient@example.com',
        username: 'chatrepositoryrecipient',
      },
      {
        id: outsiderUserId,
        name: '채팅 저장소 외부 사용자',
        email: 'chat-repository-outsider@example.com',
        username: 'chatrepositoryoutsider',
      },
    ]);
  });

  afterAll(async () => {
    await database.delete(chatConversation);
    await database.delete(user).where(inArray(user.id, userIds));
    await moduleRef.close();
  });

  it('동일한 일대일 대화 키는 하나의 대화만 만들고 기존 대화를 조회할 수 있다', async () => {
    const directKey = 'direct-integration-key';
    const first = await repository.createDirectConversation({
      directKey,
      participantUserIds: [actorUserId, recipientUserId],
    });
    const duplicate = await repository.createDirectConversation({
      directKey,
      participantUserIds: [actorUserId, recipientUserId],
    });

    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();
    await expect(
      repository.findDirectByKey(directKey, actorUserId),
    ).resolves.toMatchObject({ id: first!.id, kind: 'direct', directKey });
    await expect(
      repository.findDirectByKey(directKey, recipientUserId),
    ).resolves.toMatchObject({ id: first!.id });
  });

  it('메시지 커서는 생성 시각과 식별자 순서를 함께 사용하고 참가자 범위를 지킨다', async () => {
    const conversation = await repository.createChannelConversation({
      name: '통합 채널',
      topic: null,
      participantUserIds: [actorUserId, recipientUserId],
    });
    const sharedCreatedAt = new Date('2026-10-04T00:00:00.000Z');
    const newestCreatedAt = new Date('2026-10-04T00:01:00.000Z');

    await database.insert(chatMessage).values([
      {
        id: firstMessageId,
        conversationId: conversation.id,
        senderKind: 'user',
        senderUserId: recipientUserId,
        contentType: 'text',
        content: { text: '첫 번째' },
        createdAt: sharedCreatedAt,
        updatedAt: sharedCreatedAt,
      },
      {
        id: secondMessageId,
        conversationId: conversation.id,
        senderKind: 'user',
        senderUserId: recipientUserId,
        contentType: 'text',
        content: { text: '두 번째' },
        createdAt: sharedCreatedAt,
        updatedAt: sharedCreatedAt,
      },
      {
        id: thirdMessageId,
        conversationId: conversation.id,
        senderKind: 'user',
        senderUserId: actorUserId,
        contentType: 'text',
        content: { text: '세 번째' },
        createdAt: newestCreatedAt,
        updatedAt: newestCreatedAt,
      },
    ]);

    const firstPage = await repository.listMessages({
      conversationId: conversation.id,
      userId: actorUserId,
      limit: 2,
    });
    if (!firstPage) {
      throw new Error('참가자의 첫 메시지 페이지를 조회하지 못했습니다.');
    }
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.items.map(({ id }) => id)).toEqual([
      secondMessageId,
      thirdMessageId,
    ]);

    const olderPage = await repository.listMessages({
      conversationId: conversation.id,
      userId: actorUserId,
      before: {
        createdAt: sharedCreatedAt,
        id: secondMessageId,
      },
      limit: 2,
    });
    if (!olderPage) {
      throw new Error('참가자의 이전 메시지 페이지를 조회하지 못했습니다.');
    }
    expect(olderPage.hasMore).toBe(false);
    expect(olderPage.items.map(({ id }) => id)).toEqual([firstMessageId]);

    await expect(
      repository.listMessages({
        conversationId: conversation.id,
        userId: outsiderUserId,
        limit: 2,
      }),
    ).resolves.toBeNull();
  });

  it('읽지 않은 메시지 수는 다른 사용자의 새 메시지만 세고 읽음 처리 뒤에는 0이 된다', async () => {
    const conversation = await repository.createChannelConversation({
      name: '읽음 상태 채널',
      topic: null,
      participantUserIds: [actorUserId, recipientUserId],
    });

    await repository.createTextMessage({
      conversationId: conversation.id,
      senderUserId: actorUserId,
      text: '내 메시지',
    });
    await repository.createTextMessage({
      conversationId: conversation.id,
      senderUserId: recipientUserId,
      text: '상대 메시지',
    });

    const beforeRead = await repository.findConversationState(
      conversation.id,
      actorUserId,
    );
    expect(beforeRead?.unreadCount).toBe(1);

    await expect(
      repository.markRead({
        conversationId: conversation.id,
        userId: actorUserId,
        readAt: new Date(),
      }),
    ).resolves.toBe(true);

    const afterRead = await repository.findConversationState(
      conversation.id,
      actorUserId,
    );
    expect(afterRead?.unreadCount).toBe(0);
  });
});
