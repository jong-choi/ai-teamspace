import type { ChatConversation } from '@/chat/domain/chat-conversation';
import type { ChatMessage } from '@/chat/domain/chat-message';
import type { ChatParticipant } from '@/chat/domain/chat-participant';

export type ChatConversationState = {
  conversation: ChatConversation;
  participants: ChatParticipant[];
  latestMessage: ChatMessage | null;
  unreadCount: number;
};
