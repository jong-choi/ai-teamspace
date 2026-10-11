import type { ViewProps } from 'react-native';

import { useAgentChatStore } from '@core/features/agent-chat/agent-chat-provider';
import { useAgentChatWideLayout } from '@core/features/agent-chat/lib/use-agent-chat-layout';

// 바깥 영역을 누르면 넓은 화면에서는 확장을 풀고, 좁은 화면에서는 패널을 닫는다.
// responder를 가져가지 않으므로 눌린 메뉴나 버튼의 동작은 그대로 이어진다.
export function useAgentChatOutsidePress(): Pick<
  ViewProps,
  'onStartShouldSetResponderCapture'
> {
  const wide = useAgentChatWideLayout();
  const setExpanded = useAgentChatStore((state) => state.setExpanded);
  const closePanel = useAgentChatStore((state) => state.closePanel);

  return {
    onStartShouldSetResponderCapture: () => {
      if (wide) {
        setExpanded(false);
      } else {
        closePanel();
      }
      return false;
    },
  };
}
