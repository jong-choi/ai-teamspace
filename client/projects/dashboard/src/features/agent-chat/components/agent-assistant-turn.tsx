import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { AgentMarkdown } from '@core/features/agent-chat/components/agent-markdown';
import { AgentReasoningBlock } from '@core/features/agent-chat/components/agent-reasoning-block';
import { AgentToolCallBlock } from '@core/features/agent-chat/components/agent-tool-call-block';
import {
  type AgentChatTurn,
  buildAgentTurnCopyText,
} from '@core/features/agent-chat/lib/agent-chat-turns';

import { Copy } from 'lucide-react-native';

export function AgentAssistantTurn({
  running,
  turn,
}: {
  running: boolean;
  turn: Extract<AgentChatTurn, { kind: 'assistant' }>;
}) {
  const { copyText, notifyError, notifySuccess } = useDashboardPlatform();
  const copyValue = buildAgentTurnCopyText(turn);
  const hasText = turn.items.some((item) => item.kind === 'text');

  const copy = async () => {
    try {
      await copyText(copyValue);
      notifySuccess({ id: 'agent-copy', title: '응답을 복사했습니다' });
    } catch {
      notifyError({ id: 'agent-copy', title: '응답을 복사하지 못했습니다' });
    }
  };

  return (
    <View className="w-full gap-2">
      {turn.reasoning ? (
        <AgentReasoningBlock
          reasoning={turn.reasoning}
          thinking={running && !hasText}
        />
      ) : null}

      {turn.items.map((item) =>
        item.kind === 'text' ? (
          <View
            className="w-full rounded-xl rounded-tl-sm bg-muted/40 px-3.5 py-2.5"
            key={item.key}
          >
            <AgentMarkdown content={item.text} />
          </View>
        ) : (
          <AgentToolCallBlock item={item} key={item.key} />
        ),
      )}

      {running ? null : (
        <View className="flex-row items-center justify-between px-1">
          <Text className="text-[11px] text-muted-foreground">
            {turn.createdAt ? formatTurnTime(turn.createdAt) : ''}
          </Text>
          {copyValue ? (
            <Button
              accessibilityLabel="응답 복사"
              className="h-6 w-6"
              onPress={() => void copy()}
              size="icon"
              variant="ghost"
            >
              <Icon as={Copy} className="size-3 text-muted-foreground" />
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function AgentUserMessage({ text }: { text: string }) {
  return (
    <View className="w-full items-end">
      <View className="max-w-[85%] rounded-xl rounded-tr-sm bg-foreground px-3.5 py-2.5">
        <Text className="text-sm leading-6 text-background" selectable>
          {text}
        </Text>
      </View>
    </View>
  );
}

export function AgentTypingIndicator({
  label = 'Agent가 응답하는 중',
}: {
  label?: string;
}) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      className="flex-row items-center gap-2"
    >
      <View className="flex-row gap-1">
        <View className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
        <View className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
        <View className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
      </View>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

function formatTurnTime(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
