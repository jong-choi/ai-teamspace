import { Injectable } from '@nestjs/common';

import type { ChatConversation } from '@/chat/domain/chat-conversation';
import type { ChatConversationState } from '@/chat/domain/chat-conversation-state';
import type { ChatMessage } from '@/chat/domain/chat-message';
import type { ChatMessageContentInput } from '@/chat/domain/chat-message-content';
import { decodeChatMessageCursor } from '@/chat/domain/chat-message-cursor';
import type { ChatParticipant } from '@/chat/domain/chat-participant';
import type { CreateChatChannelInput } from '@/chat/dto/create-chat-channel.dto';
import type { MarkChatReadInput } from '@/chat/dto/mark-chat-read.dto';
import type { QueryChatMessagesInput } from '@/chat/dto/query-chat-messages.dto';
import type { SendChatMessageInput } from '@/chat/dto/send-chat-message.dto';
import type { UpdateChatMessageInput } from '@/chat/dto/update-chat-message.dto';
import {
  type ChatMessagePage,
  ChatRepository,
  type DeliverReferencedSystemMessageResult,
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
    input: CreateChatChannelInput,
    participantUserIds: readonly ChatParticipant['userId'][],
  ): Promise<ChatConversation> {
    return this.database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(chatConversation)
        .values(
          toChatConversationInsert({
            kind: 'channel',
            name: input.name,
            topic: input.topic ?? null,
            directKey: null,
          }),
        )
        .returning();

      if (!row) {
        throw new Error('채팅 채널 생성 결과가 없습니다.');
      }

      await transaction.insert(chatParticipant).values(
        participantUserIds.map((userId) =>
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
    directKey: NonNullable<ChatConversation['directKey']>,
    participantUserIds: readonly ChatParticipant['userId'][],
  ): Promise<ChatConversation | null> {
    return this.database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(chatConversation)
        .values(
          toChatConversationInsert({
            kind: 'direct',
            name: null,
            topic: null,
            directKey,
          }),
        )
        .onConflictDoNothing({ target: chatConversation.directKey })
        .returning();

      if (!row) {
        return null;
      }

      await transaction.insert(chatParticipant).values(
        participantUserIds.map((userId) =>
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
    recipientUserId: ChatParticipant['userId'],
    content: ChatMessageContentInput,
    referenceKind: NonNullable<ChatMessage['referenceKind']>,
    referenceId: NonNullable<ChatMessage['referenceId']>,
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
            systemUserId: recipientUserId,
          }),
        )
        .onConflictDoNothing({ target: chatConversation.systemUserId })
        .returning();

      let conversation = createdConversation;
      if (createdConversation) {
        await transaction.insert(chatParticipant).values(
          toChatParticipantInsert({
            conversationId: createdConversation.id,
            userId: recipientUserId,
          }),
        );
      } else {
        [conversation] = await transaction
          .select()
          .from(chatConversation)
          .where(eq(chatConversation.systemUserId, recipientUserId))
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
            contentType: content.contentType,
            content: content.content,
            referenceKind,
            referenceId,
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
              eq(chatMessage.referenceKind, referenceKind),
              eq(chatMessage.referenceId, referenceId),
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
    conversationId: ChatConversation['id'],
    userId: ChatParticipant['userId'],
    input: QueryChatMessagesInput,
  ): Promise<ChatMessagePage | null> {
    const conversation = await this.findConversationForUser(
      conversationId,
      userId,
    );
    if (!conversation) {
      return null;
    }

    const before = input.before
      ? decodeChatMessageCursor(input.before)
      : undefined;
    const cursorCondition = before
      ? or(
          lt(chatMessage.createdAt, before.createdAt),
          and(
            eq(chatMessage.createdAt, before.createdAt),
            lt(chatMessage.id, before.id),
          ),
        )
      : undefined;

    const rows = await this.database.db
      .select()
      .from(chatMessage)
      .where(
        cursorCondition
          ? and(eq(chatMessage.conversationId, conversationId), cursorCondition)
          : eq(chatMessage.conversationId, conversationId),
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

  async createTextMessage(
    conversationId: ChatConversation['id'],
    senderUserId: ChatParticipant['userId'],
    input: SendChatMessageInput,
  ): Promise<ChatMessage> {
    return this.database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(chatMessage)
        .values(
          toChatMessageInsert({
            conversationId,
            senderKind: 'user',
            senderUserId,
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
        .where(eq(chatConversation.id, conversationId));

      return toChatMessageDomain(row);
    });
  }

  async updateTextMessage(
    conversationId: ChatConversation['id'],
    messageId: ChatMessage['id'],
    senderUserId: ChatParticipant['userId'],
    input: UpdateChatMessageInput,
  ): Promise<ChatMessage | null> {
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
          eq(chatMessage.id, messageId),
          eq(chatMessage.conversationId, conversationId),
          eq(chatMessage.senderKind, 'user'),
          eq(chatMessage.senderUserId, senderUserId),
          eq(chatMessage.contentType, 'text'),
        ),
      )
      .returning();

    return row ? toChatMessageDomain(row) : null;
  }

  async markRead(
    conversationId: ChatConversation['id'],
    userId: ChatParticipant['userId'],
    input: MarkChatReadInput,
  ): Promise<MarkChatReadResult> {
    return this.database.db.transaction(async (transaction) => {
      const [message] = await transaction
        .select({ createdAt: chatMessage.createdAt })
        .from(chatMessage)
        .innerJoin(
          chatParticipant,
          eq(chatParticipant.conversationId, chatMessage.conversationId),
        )
        .where(
          and(
            eq(chatMessage.id, input.messageId),
            eq(chatMessage.conversationId, conversationId),
            eq(chatParticipant.userId, userId),
          ),
        )
        .limit(1);
      if (!message) {
        return { status: 'message_not_found' };
      }

      const rows = await transaction
        .update(chatParticipant)
        .set(toChatParticipantUpdate({ lastReadAt: message.createdAt }))
        .where(
          and(
            eq(chatParticipant.conversationId, conversationId),
            eq(chatParticipant.userId, userId),
            or(
              isNull(chatParticipant.lastReadAt),
              lt(chatParticipant.lastReadAt, message.createdAt),
            ),
          ),
        )
        .returning({ conversationId: chatParticipant.conversationId });

      if (rows.length > 0) {
        return { status: 'advanced', readAt: message.createdAt };
      }

      const [participant] = await transaction
        .select({ conversationId: chatParticipant.conversationId })
        .from(chatParticipant)
        .where(
          and(
            eq(chatParticipant.conversationId, conversationId),
            eq(chatParticipant.userId, userId),
          ),
        )
        .limit(1);

      return participant
        ? { status: 'unchanged', readAt: message.createdAt }
        : null;
    });
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
