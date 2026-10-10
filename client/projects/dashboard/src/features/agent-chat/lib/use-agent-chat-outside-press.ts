import type { ViewProps } from 'react-native';

import { useAgentChatStore } from '@core/features/agent-chat/agent-chat-provider';

// 확장된 채팅의 바깥 영역에 붙이는 props다. Dialog의 바깥 클릭처럼 누르면 확장을 푼다.
// responder를 가져가지 않으므로 눌린 메뉴나 버튼의 동작은 그대로 이어진다.
export function useAgentChatOutsidePress(): Pick<
  ViewProps,
  'onStartShouldSetResponderCapture'
> {
  const expanded = useAgentChatStore((state) => state.expanded);
  const setExpanded = useAgentChatStore((state) => state.setExpanded);

  return {
    onStartShouldSetResponderCapture: () => {
      if (expanded) setExpanded(false);
      return false;
    },
  };
}
