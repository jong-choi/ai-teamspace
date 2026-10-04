import type { ChatConversation } from '#server/chat/domain/chat-conversation.js';
import type { ChatMessage } from '#server/chat/domain/chat-message.js';
import type { ChatParticipant } from '#server/chat/domain/chat-participant.js';

export type ChatConversationState = {
  conversation: ChatConversation;
  participants: ChatParticipant[];
  latestMessage: ChatMessage | null;
  unreadCount: number;
};
