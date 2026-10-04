import { useLocalSearchParams } from 'expo-router';

import { ChatMessageDetailRoute } from '@core/features/chat/chat-message-route';

export default function MessageDetailRoute() {
  const params = useLocalSearchParams<{
    conversationId: string;
    messageId: string;
  }>();

  const conversationId = firstParam(params.conversationId);
  const messageId = firstParam(params.messageId);

  if (!conversationId || !messageId) return null;
  return (
    <ChatMessageDetailRoute
      conversationId={conversationId}
      messageId={messageId}
    />
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
