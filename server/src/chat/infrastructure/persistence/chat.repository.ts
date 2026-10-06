import type { ChatConversation } from '@/chat/domain/chat-conversation';
import type { ChatConversationState } from '@/chat/domain/chat-conversation-state';
import type { ChatMessage } from '@/chat/domain/chat-message';
import type { ChatMessageContentInput } from '@/chat/domain/chat-message-content';
import type { ChatParticipant } from '@/chat/domain/chat-participant';
import type { CreateChatChannelInput } from '@/chat/dto/create-chat-channel.dto';
import type { MarkChatReadInput } from '@/chat/dto/mark-chat-read.dto';
import type { QueryChatMessagesInput } from '@/chat/dto/query-chat-messages.dto';
import type { SendChatMessageInput } from '@/chat/dto/send-chat-message.dto';
import type { UpdateChatMessageInput } from '@/chat/dto/update-chat-message.dto';

export type ChatMessagePage = {
  items: ChatMessage[];
  hasMore: boolean;
};

export type MarkChatReadResult =
  | {
      status: 'advanced' | 'unchanged';
      readAt: NonNullable<ChatParticipant['lastReadAt']>;
    }
  | { status: 'message_not_found' }
  | null;

export type DeliverReferencedSystemMessageResult = {
  conversation: ChatConversation;
  conversationCreated: boolean;
  message: ChatMessage;
  messageCreated: boolean;
};

export abstract class ChatRepository {
  abstract createChannelConversation(
    input: CreateChatChannelInput,
    participantUserIds: readonly ChatParticipant['userId'][],
  ): Promise<ChatConversation>;

  abstract createDirectConversation(
    directKey: NonNullable<ChatConversation['directKey']>,
    participantUserIds: readonly ChatParticipant['userId'][],
  ): Promise<ChatConversation | null>;

  abstract findDirectByKey(
    directKey: string,
    userId: string,
  ): Promise<ChatConversation | null>;

  abstract deliverReferencedSystemMessage(
    recipientUserId: ChatParticipant['userId'],
    content: ChatMessageContentInput,
    referenceKind: NonNullable<ChatMessage['referenceKind']>,
    referenceId: NonNullable<ChatMessage['referenceId']>,
  ): Promise<DeliverReferencedSystemMessageResult>;

  abstract listConversationStates(
    userId: string,
  ): Promise<ChatConversationState[]>;

  abstract findConversationState(
    conversationId: string,
    userId: string,
  ): Promise<ChatConversationState | null>;

  abstract listMessages(
    conversationId: ChatConversation['id'],
    userId: ChatParticipant['userId'],
    input: QueryChatMessagesInput,
  ): Promise<ChatMessagePage | null>;

  abstract findMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<ChatMessage | null>;

  abstract createTextMessage(
    conversationId: ChatConversation['id'],
    senderUserId: ChatParticipant['userId'],
    input: SendChatMessageInput,
  ): Promise<ChatMessage>;

  abstract updateTextMessage(
    conversationId: ChatConversation['id'],
    messageId: ChatMessage['id'],
    senderUserId: ChatParticipant['userId'],
    input: UpdateChatMessageInput,
  ): Promise<ChatMessage | null>;

  abstract markRead(
    conversationId: ChatConversation['id'],
    userId: ChatParticipant['userId'],
    input: MarkChatReadInput,
  ): Promise<MarkChatReadResult>;
}
