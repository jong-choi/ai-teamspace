import type {
  ChatMessage,
  ChatMessagePage,
} from '@repo/client/api-client/schemas';

import type { InfiniteData } from '@tanstack/react-query';

export const CHAT_MESSAGE_PAGE_SIZE = 50;

export type MessageHistory = InfiniteData<ChatMessagePage, string | undefined>;

export function flattenChatMessageHistory(
  history: MessageHistory | undefined,
): ChatMessage[] {
  if (!history) {
    return [];
  }

  const messagesById = new Map<string, ChatMessage>();
  for (const page of history.pages) {
    for (const message of page.items) {
      const current = messagesById.get(message.id);
      if (!current || compareChatMessageVersions(current, message) < 0) {
        messagesById.set(message.id, message);
      }
    }
  }

  return [...messagesById.values()].sort(compareChatMessages);
}

export function compareChatMessages(
  left: ChatMessage,
  right: ChatMessage,
): number {
  const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
  return byCreatedAt !== 0 ? byCreatedAt : left.id.localeCompare(right.id);
}

export function compareChatMessageVersions(
  left: ChatMessage,
  right: ChatMessage,
): number {
  return left.updatedAt.localeCompare(right.updatedAt);
}
