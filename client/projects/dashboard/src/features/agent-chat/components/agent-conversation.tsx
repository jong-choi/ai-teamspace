import { type ReactNode, useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import {
  AgentAssistantTurn,
  AgentTypingIndicator,
  AgentUserMessage,
} from '@core/features/agent-chat/components/agent-assistant-turn';
import type { AgentChatTurn } from '@core/features/agent-chat/lib/agent-chat-turns';
import { useAgentConversationScroll } from '@core/features/agent-chat/lib/use-agent-conversation-scroll';

import { ArrowDown } from 'lucide-react-native';

export function AgentConversation({
  footer,
  hydrating,
  organizationId,
  running,
  threadId,
  turns,
}: {
  footer?: ReactNode;
  hydrating: boolean;
  organizationId: string;
  running: boolean;
  threadId: string;
  turns: readonly AgentChatTurn[];
}) {
  const groups = useMemo(() => groupConversationTurns(turns), [turns]);
  const latestGroupKey = groups.at(-1)?.key ?? null;
  const lastTurn = turns.at(-1);
  const waitingForFirstToken =
    running && (!lastTurn || lastTurn.kind === 'user');

  const scroll = useAgentConversationScroll({
    hydrating,
    latestTurnKey: latestGroupKey,
    organizationId,
    running,
    threadId,
  });

  return (
    <View className="relative min-h-0 flex-1">
      <ScrollView
        accessibilityLabel="Agent 대화"
        className="min-h-0 flex-1"
        contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-5"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scroll.handleContentSizeChange}
        onLayout={scroll.handleViewportLayout}
        onMomentumScrollEnd={scroll.commitOffset}
        onScroll={scroll.handleScroll}
        onScrollEndDrag={scroll.commitOffset}
        ref={scroll.scrollRef}
        scrollEventThrottle={16}
      >
        {hydrating ? (
          <AgentTypingIndicator label="대화를 불러오는 중" />
        ) : (
          <View
            className="gap-5"
            onLayout={scroll.handleConversationLayout}
            testID="agent-conversation-turns"
          >
            {groups.map((group) => {
              const latest = group.key === latestGroupKey;
              return (
                <View
                  key={group.key}
                  onLayout={(event) =>
                    scroll.handleTurnLayout(group.key, event)
                  }
                  style={
                    latest
                      ? { minHeight: scroll.latestTurnMinHeight }
                      : undefined
                  }
                  testID={`agent-turn-${group.key}`}
                >
                  <View
                    className="gap-5"
                    onLayout={(event) =>
                      scroll.handleTurnContentLayout(group.key, event)
                    }
                    testID={`agent-turn-content-${group.key}`}
                  >
                    {group.turns.map((turn) =>
                      turn.kind === 'user' ? (
                        <AgentUserMessage key={turn.key} text={turn.text} />
                      ) : (
                        <AgentAssistantTurn
                          key={turn.key}
                          running={running && turn === lastTurn}
                          turn={turn}
                        />
                      ),
                    )}
                    {latest && waitingForFirstToken ? (
                      <AgentTypingIndicator />
                    ) : null}
                    {latest && footer ? (
                      <View className="gap-3">{footer}</View>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {groups.length === 0 ? (
              <>
                {waitingForFirstToken ? <AgentTypingIndicator /> : null}
                {footer ? <View className="gap-3">{footer}</View> : null}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
      {scroll.showLatestButton ? (
        <Button
          accessibilityLabel="최신 응답으로 이동"
          className="absolute bottom-3 right-4 rounded-full"
          onPress={scroll.scrollToLatest}
          size="icon"
          variant="outline"
        >
          <Icon as={ArrowDown} className="size-4 text-foreground" />
        </Button>
      ) : null}
    </View>
  );
}

// 질문과 이어지는 응답·도구 호출을 같은 묶음에 두어 스트리밍 중 기준점이 바뀌지 않게 한다.
function groupConversationTurns(turns: readonly AgentChatTurn[]) {
  const groups: { key: AgentChatTurn['key']; turns: AgentChatTurn[] }[] = [];
  for (const turn of turns) {
    const previous = groups.at(-1);
    if (turn.kind === 'user' || !previous) {
      groups.push({ key: turn.key, turns: [turn] });
    } else {
      previous.turns.push(turn);
    }
  }
  return groups;
}
