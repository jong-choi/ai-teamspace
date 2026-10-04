import { useLocalSearchParams } from 'expo-router';

import { ChatRoute } from '@core/features/chat/chat-route';

export default function ChatConversationRoute() {
  const params = useLocalSearchParams<{
    conversationId: string;
    messageId?: string;
  }>();

  return (
    <ChatRoute
      conversationId={firstParam(params.conversationId)}
      focusedMessageId={firstParam(params.messageId)}
    />
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
