import { ScrollView, View } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import { projectAgentMessageText } from '@core/features/agent-chat/lib/agent-message-presentation';

import type { Message } from '@langchain/langgraph-sdk';

export function AgentMessageList({ messages }: { messages: Message[] }) {
  const visible = messages.filter(
    (message) =>
      message.type === 'human' ||
      message.type === 'ai' ||
      message.type === 'tool',
  );

  return (
    <ScrollView
      className="min-h-0 flex-1"
      contentContainerClassName="mx-auto w-full max-w-3xl gap-4 px-4 py-6 sm:px-6"
      showsVerticalScrollIndicator={false}
    >
      {visible.length === 0 ? (
        <View className="items-center px-4 py-16">
          <Text className="text-sm font-medium">새 Agent 대화</Text>
          <Text className="mt-1 max-w-md text-center text-xs text-muted-foreground">
            질문하거나 Work OS 작업을 요청하면 실행 과정과 결과를 여기에서
            확인할 수 있습니다.
          </Text>
        </View>
      ) : (
        visible.map((message, index) => {
          const fromUser = message.type === 'human';
          const tool = message.type === 'tool';

          return (
            <View
              className={fromUser ? 'items-end' : 'items-start'}
              key={message.id ?? `${message.type}-${index}`}
            >
              <View
                className={
                  fromUser
                    ? 'max-w-[88%] rounded-xl bg-primary px-3.5 py-2.5'
                    : 'max-w-[94%] rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-none'
                }
              >
                <Text
                  className={
                    fromUser
                      ? 'text-sm text-primary-foreground'
                      : 'text-sm text-foreground'
                  }
                >
                  {tool
                    ? message.status === 'error'
                      ? '도구 실행이 실패했습니다.'
                      : '도구 실행 결과가 Agent에 전달되었습니다.'
                    : projectAgentMessageText(message.content)}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
