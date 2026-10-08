import { type ReactNode, useRef } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  View,
} from 'react-native';

import {
  AgentAssistantTurn,
  AgentTypingIndicator,
  AgentUserMessage,
} from '@core/features/agent-chat/components/agent-assistant-turn';
import type { AgentChatTurn } from '@core/features/agent-chat/lib/agent-chat-turns';

// 바닥에서 이 거리 안에 있을 때만 새 내용에 맞춰 자동으로 내려간다.
const STICK_TO_BOTTOM_THRESHOLD = 120;

export function AgentConversation({
  footer,
  hydrating,
  running,
  turns,
}: {
  footer?: ReactNode;
  hydrating: boolean;
  running: boolean;
  turns: readonly AgentChatTurn[];
}) {
  const scrollRef = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const lastTurn = turns.at(-1);
  const waitingForFirstToken =
    running && (!lastTurn || lastTurn.kind === 'user');

  const handleScroll = ({
    nativeEvent,
  }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const distance =
      nativeEvent.contentSize.height -
      nativeEvent.layoutMeasurement.height -
      nativeEvent.contentOffset.y;
    nearBottom.current = distance <= STICK_TO_BOTTOM_THRESHOLD;
  };

  return (
    <ScrollView
      accessibilityLabel="Agent 대화"
      className="min-h-0 flex-1"
      contentContainerClassName="mx-auto w-full max-w-2xl gap-5 px-4 py-5"
      onContentSizeChange={() => {
        if (nearBottom.current) {
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      }}
      onScroll={handleScroll}
      ref={scrollRef}
      scrollEventThrottle={64}
    >
      {hydrating ? (
        <AgentTypingIndicator label="대화를 불러오는 중" />
      ) : (
        <>
          {turns.map((turn, index) =>
            turn.kind === 'user' ? (
              <AgentUserMessage key={turn.key} text={turn.text} />
            ) : (
              <AgentAssistantTurn
                key={turn.key}
                running={running && index === turns.length - 1}
                turn={turn}
              />
            ),
          )}
          {waitingForFirstToken ? <AgentTypingIndicator /> : null}
          {footer ? <View className="gap-3">{footer}</View> : null}
        </>
      )}
    </ScrollView>
  );
}
