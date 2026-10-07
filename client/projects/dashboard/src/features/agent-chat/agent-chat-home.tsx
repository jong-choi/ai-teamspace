import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { useAgentChatNavigation } from '@core/features/agent-chat/agent-chat-navigation-provider';
import { useAgentChatPlatform } from '@core/features/agent-chat/agent-chat-platform';
import { getAgentThreadsQueryKey } from '@core/features/agent-chat/agent-thread-query';
import { AgentChatComposer } from '@core/features/agent-chat/components/agent-chat-composer';
import { agentGraphId } from '@core/features/agent-chat/lib/agent-protocol-client';
import { deriveAgentThreadTitle } from '@core/features/agent-chat/lib/agent-thread-title';

import { useQueryClient } from '@tanstack/react-query';
import { Bot } from 'lucide-react-native';

export function AgentChatHome({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notifyError } = useDashboardPlatform();
  const { client } = useAgentChatPlatform();
  const { clearStarter, stageStarter } = useAgentChatNavigation();

  const createAndNavigate = async (message: string): Promise<boolean> => {
    let threadId: string;

    try {
      const thread = await client.threads.create({
        graphId: agentGraphId,
        metadata: {
          title: deriveAgentThreadTitle(message),
        },
      });
      threadId = thread.thread_id;
    } catch {
      notifyError({
        id: 'agent-thread-create',
        title: 'Agent 대화를 만들지 못했습니다',
        description: '조직과 로그인 상태를 확인한 뒤 다시 시도해 주세요.',
      });
      return false;
    }

    stageStarter(threadId, message);
    void queryClient.invalidateQueries({
      queryKey: getAgentThreadsQueryKey(userId, organizationId),
    });

    try {
      router.replace({
        pathname: '/ai/[threadId]',
        params: { threadId },
      });
      return true;
    } catch {
      clearStarter(threadId);
      notifyError({
        id: 'agent-thread-navigation',
        title: '새 Agent 대화를 열지 못했습니다',
        description:
          '대화는 생성되었습니다. 목록에서 다시 열거나 현재 메시지를 다시 보내 주세요.',
      });
      return false;
    }
  };

  return (
    <View className="min-h-0 flex-1 bg-background">
      <View className="min-h-0 flex-1 items-center justify-center px-5">
        <View className="max-w-lg items-center gap-3">
          <View className="size-11 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10">
            <Icon
              as={Bot}
              className="size-5 text-violet-600 dark:text-violet-400"
            />
          </View>
          <Text className="text-lg font-semibold tracking-tight">
            Work OS Agent
          </Text>
          <Text className="text-center text-xs leading-5 text-muted-foreground">
            현재 조직의 프로젝트, 위키, 일정과 업무 맥락을 바탕으로 질문하고
            작업을 요청할 수 있습니다.
          </Text>
        </View>
      </View>
      <AgentChatComposer busy={false} onSubmit={createAndNavigate} />
    </View>
  );
}
