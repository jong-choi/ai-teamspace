import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { getAgentThreadTitle } from '@core/features/agent-chat/lib/agent-thread-title';

import type { Thread } from '@langchain/langgraph-sdk';
import { MessageSquarePlus, Plus } from 'lucide-react-native';

export function AgentThreadSidebar({
  activeThreadId,
  onCreateNew,
  onSelectThread,
  threads,
}: {
  activeThreadId?: string;
  onCreateNew: () => void;
  onSelectThread: (threadId: string) => void;
  threads: Thread[];
}) {
  return (
    <View className="shrink-0 border-b border-border bg-sidebar md:min-h-0 md:w-64 md:border-b-0 md:border-r">
      <View className="shrink-0 p-2 md:border-b md:border-border md:p-3">
        <Button
          accessibilityLabel="새 Agent 대화"
          className="h-8 justify-start gap-2 px-3 md:w-full"
          onPress={onCreateNew}
          size="sm"
          variant="outline"
        >
          <Icon as={Plus} className="size-3.5" />
          <Text className="text-xs">새 대화</Text>
        </Button>
      </View>

      <ScrollView
        className="max-h-14 md:hidden"
        contentContainerClassName="flex-row gap-1 px-2 pb-2"
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {threads.map((thread) => (
          <ThreadButton
            active={thread.thread_id === activeThreadId}
            compact
            key={thread.thread_id}
            onPress={() => onSelectThread(thread.thread_id)}
            thread={thread}
          />
        ))}
      </ScrollView>

      <ScrollView
        className="hidden min-h-0 flex-1 md:flex"
        contentContainerClassName="gap-1 p-2"
        showsVerticalScrollIndicator={false}
      >
        {threads.length === 0 ? (
          <View className="items-center gap-2 px-3 py-8">
            <Icon
              as={MessageSquarePlus}
              className="size-5 text-muted-foreground"
            />
            <Text className="text-center text-xs text-muted-foreground">
              아직 Agent 대화가 없습니다.
            </Text>
          </View>
        ) : (
          threads.map((thread) => (
            <ThreadButton
              active={thread.thread_id === activeThreadId}
              key={thread.thread_id}
              onPress={() => onSelectThread(thread.thread_id)}
              thread={thread}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ThreadButton({
  active,
  compact = false,
  onPress,
  thread,
}: {
  active: boolean;
  compact?: boolean;
  onPress: () => void;
  thread: Thread;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        'rounded-lg web:hover:bg-accent/60',
        compact ? 'max-w-48 px-3 py-2' : 'px-3 py-2.5',
        active && 'bg-accent',
      )}
      onPress={onPress}
    >
      <Text
        className={cn(
          'truncate text-xs font-medium',
          active ? 'text-accent-foreground' : 'text-foreground',
        )}
      >
        {getAgentThreadTitle(thread.metadata ?? {})}
      </Text>
      {compact ? null : (
        <View className="mt-1 flex-row items-center justify-between gap-2">
          <Text className="text-[10px] text-muted-foreground">
            {formatUpdatedAt(thread.updated_at)}
          </Text>
          {thread.status === 'busy' || thread.status === 'interrupted' ? (
            <Text className="text-[10px] font-medium text-muted-foreground">
              {thread.status === 'busy' ? '실행 중' : '입력 대기'}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '업데이트 시간 없음';

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
