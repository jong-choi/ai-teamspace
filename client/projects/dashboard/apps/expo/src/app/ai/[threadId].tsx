import { useLocalSearchParams } from 'expo-router';

import { AgentChatRoute } from '@core/features/agent-chat/agent-chat-route';

export default function AgentThreadRoute() {
  const params = useLocalSearchParams<{
    threadId?: string | string[];
  }>();
  const threadId = firstParam(params.threadId);
  const validThreadId =
    threadId && isAgentThreadId(threadId) ? threadId : undefined;

  return (
    <AgentChatRoute invalidThreadId={!validThreadId} threadId={validThreadId} />
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isAgentThreadId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}
