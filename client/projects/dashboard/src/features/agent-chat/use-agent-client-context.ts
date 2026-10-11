import { useMemo } from 'react';
import { useGlobalSearchParams, useSegments } from 'expo-router';

import {
  type AgentClientContext,
  buildAgentClientContext,
} from '@core/features/agent-chat/lib/agent-client-context';

/** 사용자가 지금 보고 있는 화면을 Agent run에 실어 보낼 맥락으로 읽는다. */
export function useAgentClientContext(): AgentClientContext {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const serialized = JSON.stringify(
    buildAgentClientContext({ segments, params }),
  );
  // 내용이 같으면 같은 객체를 돌려줘 화면을 다시 그릴 때마다 submit option이 바뀌지 않게 한다.
  return useMemo(
    () => JSON.parse(serialized) as AgentClientContext,
    [serialized],
  );
}
