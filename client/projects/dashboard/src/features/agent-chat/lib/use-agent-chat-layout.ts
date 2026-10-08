import { useWindowDimensions } from 'react-native';

// Tailwind lg breakpoint와 같은 기준이다. 이 폭 이상일 때만 우측 패널과 확장을 쓴다.
export const AGENT_CHAT_WIDE_MIN_WIDTH = 1024;

export function useAgentChatWideLayout(): boolean {
  return useWindowDimensions().width >= AGENT_CHAT_WIDE_MIN_WIDTH;
}
