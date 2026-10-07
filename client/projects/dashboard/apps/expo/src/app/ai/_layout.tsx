import { Slot } from 'expo-router';

import { AgentChatNavigationProvider } from '@core/features/agent-chat/agent-chat-navigation-provider';

export default function AgentChatLayout() {
  return (
    <AgentChatNavigationProvider>
      <Slot />
    </AgentChatNavigationProvider>
  );
}
