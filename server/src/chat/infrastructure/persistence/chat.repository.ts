import type { ChatConversation } from '@/chat/domain/chat-conversation';
import type { ChatConversationState } from '@/chat/domain/chat-conversation-state';
import type { ChatMessage } from '@/chat/domain/chat-message';
import type { ChatMessageContentInput } from '@/chat/domain/chat-message-content';
import type { ChatMessageCursor } from '@/chat/domain/chat-message-cursor';

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

export type MarkChatReadResult = 'advanced' | 'unchanged' | null;

export type DeliverReferencedSystemMessageInput = ChatMessageContentInput & {
  recipientUserId: string;
  referenceKind: string;
  referenceId: string;
};

export type DeliverReferencedSystemMessageResult = {
  conversation: ChatConversation;
  conversationCreated: boolean;
  message: ChatMessage;
  messageCreated: boolean;
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

  abstract deliverReferencedSystemMessage(
    input: DeliverReferencedSystemMessageInput,
  ): Promise<DeliverReferencedSystemMessageResult>;

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
  }): Promise<MarkChatReadResult>;
}
