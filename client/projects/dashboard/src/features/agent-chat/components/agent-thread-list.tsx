import { Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { getAgentThreadTitle } from '@core/features/agent-chat/lib/agent-thread-title';

import type { Thread } from '@langchain/langgraph-sdk';
import { MessageSquarePlus } from 'lucide-react-native';

export function AgentThreadList({
  activeThreadId,
  onSelectThread,
  threads,
}: {
  activeThreadId: string | null;
  onSelectThread: (threadId: string, title: string) => void;
  threads: readonly Thread[];
}) {
  if (threads.length === 0) {
    return (
      <View className="items-center gap-2 px-3 py-8">
        <Icon as={MessageSquarePlus} className="size-5 text-muted-foreground" />
        <Text className="text-center text-xs text-muted-foreground">
          아직 Agent 대화가 없습니다.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      accessibilityLabel="Agent 대화 목록"
      className="min-h-0 flex-1"
      contentContainerClassName="gap-0.5 p-2"
      showsVerticalScrollIndicator={false}
    >
      {threads.map((thread) => {
        const active = thread.thread_id === activeThreadId;
        const title = getAgentThreadTitle(thread.metadata ?? {});
        return (
          <Pressable
            accessibilityLabel={title}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={cn(
              'rounded-lg px-3 py-2',
              active ? 'bg-accent' : 'web:hover:bg-accent/60',
            )}
            key={thread.thread_id}
            onPress={() => onSelectThread(thread.thread_id, title)}
          >
            <Text
              className={cn(
                'text-xs font-medium',
                active ? 'text-accent-foreground' : 'text-foreground',
              )}
              numberOfLines={1}
            >
              {title}
            </Text>
            <View className="mt-1 flex-row items-center justify-between gap-2">
              <Text className="text-2xs text-muted-foreground">
                {formatUpdatedAt(thread.updated_at)}
              </Text>
              {thread.status === 'busy' || thread.status === 'interrupted' ? (
                <Text
                  className={cn(
                    'text-2xs font-medium',
                    thread.status === 'interrupted'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground',
                  )}
                >
                  {thread.status === 'busy' ? '실행 중' : '입력 대기'}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
