import { Pressable, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useAgentChatStore } from '@core/features/agent-chat/agent-chat-provider';

import { Sparkles } from 'lucide-react-native';

// 웹 넓은 화면의 상단 바에서 Agent 채팅 패널을 여는 진입점이다. 패널이 열려 있으면 숨긴다.
// lg 미만에서는 shell 상단 바의 토글이 같은 역할을 하므로 표시하지 않는다.
export function AgentChatOpenButton() {
  const open = useAgentChatStore((state) => state.open);
  const pendingApproval = useAgentChatStore((state) => state.pendingApproval);
  const openPanel = useAgentChatStore((state) => state.openPanel);

  if (open) return null;

  return (
    <Pressable
      accessibilityLabel={
        pendingApproval ? '에이전트 열기, 승인 대기 중' : '에이전트 열기'
      }
      accessibilityRole="button"
      className="hidden h-8 flex-row items-center gap-1.5 rounded-md px-1.5 web:hover:bg-accent/60 lg:flex"
      onPress={openPanel}
    >
      <Icon
        as={Sparkles}
        className="size-4 text-violet-500 dark:text-violet-400"
      />
      <View className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5">
        <Text className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">
          에이전트
        </Text>
      </View>
      {pendingApproval ? (
        <View className="size-2 rounded-full bg-amber-500" />
      ) : null}
    </Pressable>
  );
}
