import type { ChatConversation } from '#server/chat/domain/chat-conversation.js';
import type { ChatConversationState } from '#server/chat/domain/chat-conversation-state.js';
import type { ChatMessage } from '#server/chat/domain/chat-message.js';
import type { ChatMessageCursor } from '#server/chat/domain/chat-message-cursor.js';

export type CreateChatChannelConversationInput = {
  name: string;
  topic: string | null;
  participantUserIds: readonly string[];
};

export type CreateDirectChatConversationInput = {
  directKey: string;
  participantUserIds: readonly string[];
};

export type ListChatMessagesInput = {
  conversationId: string;
  userId: string;
  before?: ChatMessageCursor;
  limit: number;
};

export type ChatMessagePage = {
  items: ChatMessage[];
  hasMore: boolean;
};

export abstract class ChatRepository {
  abstract createChannelConversation(
    input: CreateChatChannelConversationInput,
  ): Promise<ChatConversation>;

  abstract createDirectConversation(
    input: CreateDirectChatConversationInput,
  ): Promise<ChatConversation | null>;

  abstract findDirectByKey(
    directKey: string,
    userId: string,
  ): Promise<ChatConversation | null>;

  abstract listConversationStates(
    userId: string,
  ): Promise<ChatConversationState[]>;

  abstract findConversationState(
    conversationId: string,
    userId: string,
  ): Promise<ChatConversationState | null>;

  abstract listMessages(
    input: ListChatMessagesInput,
  ): Promise<ChatMessagePage | null>;

  abstract findMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<ChatMessage | null>;

  abstract createTextMessage(input: {
    conversationId: string;
    senderUserId: string;
    text: string;
  }): Promise<ChatMessage>;

  abstract updateTextMessage(input: {
    conversationId: string;
    messageId: string;
    senderUserId: string;
    text: string;
  }): Promise<ChatMessage | null>;

  abstract markRead(input: {
    conversationId: string;
    userId: string;
    readAt: Date;
  }): Promise<boolean>;
}
