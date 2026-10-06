import { Injectable } from '@nestjs/common';

import type { ChatConversation } from '@/chat/domain/chat-conversation';
import type { ChatConversationState } from '@/chat/domain/chat-conversation-state';
import type { ChatMessage } from '@/chat/domain/chat-message';
import type { ChatParticipant } from '@/chat/domain/chat-participant';
import {
  type ChatMessagePage,
  ChatRepository,
  type CreateChatChannelConversationInput,
  type CreateDirectChatConversationInput,
  type DeliverReferencedSystemMessageInput,
  type DeliverReferencedSystemMessageResult,
  type ListChatMessagesInput,
  type MarkChatReadResult,
} from '@/chat/infrastructure/persistence/chat.repository';
import {
  toChatConversationDomain,
  toChatConversationInsert,
  toChatConversationUpdate,
} from '@/chat/infrastructure/persistence/drizzle/mappers/chat-conversation.mapper';
import {
  toChatMessageDomain,
  toChatMessageInsert,
  toChatMessageUpdate,
} from '@/chat/infrastructure/persistence/drizzle/mappers/chat-message.mapper';
import {
  toChatParticipantDomain,
  toChatParticipantInsert,
  toChatParticipantUpdate,
} from '@/chat/infrastructure/persistence/drizzle/mappers/chat-participant.mapper';
import { chatConversation } from '@/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema';
import { chatMessage } from '@/chat/infrastructure/persistence/drizzle/schema/chat-message.schema';
import { chatParticipant } from '@/chat/infrastructure/persistence/drizzle/schema/chat-participant.schema';
import { DatabaseService } from '@/database/database.service';

import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
} from 'drizzle-orm';

@Injectable()
export class ChatDrizzleRepository extends ChatRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async createChannelConversation(
    input: CreateChatChannelConversationInput,
  ): Promise<ChatConversation> {
    return this.database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(chatConversation)
        .values(
          toChatConversationInsert({
            kind: 'channel',
            name: input.name,
            topic: input.topic,
            directKey: null,
          }),
        )
        .returning();

      if (!row) {
        throw new Error('채팅 채널 생성 결과가 없습니다.');
      }

      await transaction.insert(chatParticipant).values(
        input.participantUserIds.map((userId) =>
          toChatParticipantInsert({
            conversationId: row.id,
            userId,
          }),
        ),
      );

      return toChatConversationDomain(row);
    });
  }

  async createDirectConversation(
    input: CreateDirectChatConversationInput,
  ): Promise<ChatConversation | null> {
    return this.database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(chatConversation)
        .values(
          toChatConversationInsert({
            kind: 'direct',
            name: null,
            topic: null,
            directKey: input.directKey,
          }),
        )
        .onConflictDoNothing({ target: chatConversation.directKey })
        .returning();

      if (!row) {
        return null;
      }

      await transaction.insert(chatParticipant).values(
        input.participantUserIds.map((userId) =>
          toChatParticipantInsert({
            conversationId: row.id,
            userId,
          }),
        ),
      );

      return toChatConversationDomain(row);
    });
  }

  async findDirectByKey(
    directKey: string,
    userId: string,
  ): Promise<ChatConversation | null> {
    const [row] = await this.database.db
      .select({ conversation: chatConversation })
      .from(chatConversation)
      .innerJoin(
        chatParticipant,
        eq(chatParticipant.conversationId, chatConversation.id),
      )
      .where(
        and(
          eq(chatConversation.directKey, directKey),
          eq(chatParticipant.userId, userId),
        ),
      )
      .limit(1);

    return row ? toChatConversationDomain(row.conversation) : null;
  }

  async deliverReferencedSystemMessage(
    input: DeliverReferencedSystemMessageInput,
  ): Promise<DeliverReferencedSystemMessageResult> {
    return this.database.db.transaction(async (transaction) => {
      const [createdConversation] = await transaction
        .insert(chatConversation)
        .values(
          toChatConversationInsert({
            kind: 'system',
            name: null,
            topic: null,
            directKey: null,
            systemUserId: input.recipientUserId,
          }),
        )
        .onConflictDoNothing({ target: chatConversation.systemUserId })
        .returning();

      let conversation = createdConversation;
      if (createdConversation) {
        await transaction.insert(chatParticipant).values(
          toChatParticipantInsert({
            conversationId: createdConversation.id,
            userId: input.recipientUserId,
          }),
        );
      } else {
        [conversation] = await transaction
          .select()
          .from(chatConversation)
          .where(eq(chatConversation.systemUserId, input.recipientUserId))
          .limit(1);
      }

      if (!conversation) {
        throw new Error('시스템 채팅 대화 조회 결과가 없습니다.');
      }

      const [createdMessage] = await transaction
        .insert(chatMessage)
        .values(
          toChatMessageInsert({
            conversationId: conversation.id,
            senderKind: 'system',
            senderUserId: null,
            contentType: input.contentType,
            content: input.content,
            referenceKind: input.referenceKind,
            referenceId: input.referenceId,
          }),
        )
        .onConflictDoNothing({
          target: [chatMessage.referenceKind, chatMessage.referenceId],
        })
        .returning();

      let message = createdMessage;
      if (createdMessage) {
        await transaction
          .update(chatConversation)
          .set(
            toChatConversationUpdate({ updatedAt: createdMessage.createdAt }),
          )
          .where(eq(chatConversation.id, conversation.id));
      } else {
        [message] = await transaction
          .select()
          .from(chatMessage)
          .where(
            and(
              eq(chatMessage.referenceKind, input.referenceKind),
              eq(chatMessage.referenceId, input.referenceId),
            ),
          )
          .limit(1);
      }

      if (!message || message.conversationId !== conversation.id) {
        throw new Error('참조 채팅 메시지 조회 결과가 올바르지 않습니다.');
      }

      return {
        conversation: toChatConversationDomain(conversation),
        conversationCreated: Boolean(createdConversation),
        message: toChatMessageDomain(message),
        messageCreated: Boolean(createdMessage),
      };
    });
  }

  async listConversationStates(
    userId: string,
  ): Promise<ChatConversationState[]> {
    const conversations = await this.listConversationsForUser(userId);
    return this.hydrateConversationStates(conversations, userId);
  }

  async findConversationState(
    conversationId: string,
    userId: string,
  ): Promise<ChatConversationState | null> {
    const conversation = await this.findConversationForUser(
      conversationId,
      userId,
    );
    if (!conversation) {
      return null;
    }

    const [state] = await this.hydrateConversationStates(
      [conversation],
      userId,
    );
    return state ?? null;
  }

  async listMessages(
    input: ListChatMessagesInput,
  ): Promise<ChatMessagePage | null> {
    const conversation = await this.findConversationForUser(
      input.conversationId,
      input.userId,
    );
    if (!conversation) {
      return null;
    }

    const cursorCondition = input.before
      ? or(
          lt(chatMessage.createdAt, input.before.createdAt),
          and(
            eq(chatMessage.createdAt, input.before.createdAt),
            lt(chatMessage.id, input.before.id),
          ),
        )
      : undefined;

    const rows = await this.database.db
      .select()
      .from(chatMessage)
      .where(
        cursorCondition
          ? and(
              eq(chatMessage.conversationId, input.conversationId),
              cursorCondition,
            )
          : eq(chatMessage.conversationId, input.conversationId),
      )
      .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const items = pageRows.map(toChatMessageDomain).reverse();

    return { items, hasMore };
  }

  async findMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<ChatMessage | null> {
    const [row] = await this.database.db
      .select({ message: chatMessage })
      .from(chatMessage)
      .innerJoin(
        chatParticipant,
        eq(chatParticipant.conversationId, chatMessage.conversationId),
      )
      .where(
        and(
          eq(chatMessage.id, messageId),
          eq(chatMessage.conversationId, conversationId),
          eq(chatParticipant.userId, userId),
        ),
      )
      .limit(1);

    return row ? toChatMessageDomain(row.message) : null;
  }

  async createTextMessage(input: {
    conversationId: string;
    senderUserId: string;
    text: string;
  }): Promise<ChatMessage> {
    return this.database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(chatMessage)
        .values(
          toChatMessageInsert({
            conversationId: input.conversationId,
            senderKind: 'user',
            senderUserId: input.senderUserId,
            contentType: 'text',
            content: { text: input.text },
          }),
        )
        .returning();

      if (!row) {
        throw new Error('채팅 메시지 생성 결과가 없습니다.');
      }

      await transaction
        .update(chatConversation)
        .set(toChatConversationUpdate({ updatedAt: row.createdAt }))
        .where(eq(chatConversation.id, input.conversationId));

      return toChatMessageDomain(row);
    });
  }

  async updateTextMessage(input: {
    conversationId: string;
    messageId: string;
    senderUserId: string;
    text: string;
  }): Promise<ChatMessage | null> {
    const now = new Date();
    const [row] = await this.database.db
      .update(chatMessage)
      .set(
        toChatMessageUpdate({
          content: { text: input.text },
          editedAt: now,
          updatedAt: now,
        }),
      )
      .where(
        and(
          eq(chatMessage.id, input.messageId),
          eq(chatMessage.conversationId, input.conversationId),
          eq(chatMessage.senderKind, 'user'),
          eq(chatMessage.senderUserId, input.senderUserId),
          eq(chatMessage.contentType, 'text'),
        ),
      )
      .returning();

    return row ? toChatMessageDomain(row) : null;
  }

  async markRead(input: {
    conversationId: string;
    userId: string;
    readAt: Date;
  }): Promise<MarkChatReadResult> {
    const rows = await this.database.db
      .update(chatParticipant)
      .set(toChatParticipantUpdate({ lastReadAt: input.readAt }))
      .where(
        and(
          eq(chatParticipant.conversationId, input.conversationId),
          eq(chatParticipant.userId, input.userId),
          or(
            isNull(chatParticipant.lastReadAt),
            lt(chatParticipant.lastReadAt, input.readAt),
          ),
        ),
      )
      .returning({ conversationId: chatParticipant.conversationId });

    if (rows.length > 0) {
      return 'advanced';
    }

    const [participant] = await this.database.db
      .select({ conversationId: chatParticipant.conversationId })
      .from(chatParticipant)
      .where(
        and(
          eq(chatParticipant.conversationId, input.conversationId),
          eq(chatParticipant.userId, input.userId),
        ),
      )
      .limit(1);

    return participant ? 'unchanged' : null;
  }

  private async listConversationsForUser(
    userId: string,
  ): Promise<ChatConversation[]> {
    const rows = await this.database.db
      .select({ conversation: chatConversation })
      .from(chatParticipant)
      .innerJoin(
        chatConversation,
        eq(chatParticipant.conversationId, chatConversation.id),
      )
      .where(eq(chatParticipant.userId, userId))
      .orderBy(desc(chatConversation.updatedAt), desc(chatConversation.id));

    return rows.map(({ conversation }) =>
      toChatConversationDomain(conversation),
    );
  }

  private async findConversationForUser(
    conversationId: string,
    userId: string,
  ): Promise<ChatConversation | null> {
    const [row] = await this.database.db
      .select({ conversation: chatConversation })
      .from(chatConversation)
      .innerJoin(
        chatParticipant,
        eq(chatParticipant.conversationId, chatConversation.id),
      )
      .where(
        and(
          eq(chatConversation.id, conversationId),
          eq(chatParticipant.userId, userId),
        ),
      )
      .limit(1);

    return row ? toChatConversationDomain(row.conversation) : null;
  }

  private async hydrateConversationStates(
    conversations: readonly ChatConversation[],
    userId: string,
  ): Promise<ChatConversationState[]> {
    if (conversations.length === 0) {
      return [];
    }

    const conversationIds = conversations.map(({ id }) => id);
    const [participantRows, latestMessageRows, unreadRows] = await Promise.all([
      this.database.db
        .select()
        .from(chatParticipant)
        .where(inArray(chatParticipant.conversationId, conversationIds)),
      this.database.db
        .selectDistinctOn([chatMessage.conversationId], {
          message: chatMessage,
        })
        .from(chatMessage)
        .where(inArray(chatMessage.conversationId, conversationIds))
        .orderBy(
          chatMessage.conversationId,
          desc(chatMessage.createdAt),
          desc(chatMessage.id),
        ),
      this.database.db
        .select({
          conversationId: chatParticipant.conversationId,
          unreadCount: count(chatMessage.id),
        })
        .from(chatParticipant)
        .leftJoin(
          chatMessage,
          and(
            eq(chatMessage.conversationId, chatParticipant.conversationId),
            or(
              isNull(chatParticipant.lastReadAt),
              gt(chatMessage.createdAt, chatParticipant.lastReadAt),
            ),
            or(
              isNull(chatMessage.senderUserId),
              ne(chatMessage.senderUserId, userId),
            ),
          ),
        )
        .where(
          and(
            eq(chatParticipant.userId, userId),
            inArray(chatParticipant.conversationId, conversationIds),
          ),
        )
        .groupBy(chatParticipant.conversationId),
    ]);

    const participantsByConversation = new Map<string, ChatParticipant[]>();
    for (const row of participantRows) {
      const participant = toChatParticipantDomain(row);
      const participants =
        participantsByConversation.get(participant.conversationId) ?? [];
      participants.push(participant);
      participantsByConversation.set(participant.conversationId, participants);
    }

    const latestMessageByConversation = new Map(
      latestMessageRows.map(({ message }) => [
        message.conversationId,
        toChatMessageDomain(message),
      ]),
    );
    const unreadCountByConversation = new Map(
      unreadRows.map(({ conversationId, unreadCount }) => [
        conversationId,
        unreadCount,
      ]),
    );

    return conversations.map((conversation) => ({
      conversation,
      participants: participantsByConversation.get(conversation.id) ?? [],
      latestMessage: latestMessageByConversation.get(conversation.id) ?? null,
      unreadCount: unreadCountByConversation.get(conversation.id) ?? 0,
    }));
  }
}
