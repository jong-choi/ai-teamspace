import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

import { useAgentChatStore } from '@core/features/agent-chat/agent-chat-provider';

const ANCHOR_TOP_INSET = 12;
const LATEST_CONTENT_BOTTOM_INSET = 16;
const LATEST_CONTENT_VISIBILITY_TOLERANCE = 12;

export function useAgentConversationScroll({
  hydrating,
  latestTurnKey,
  organizationId,
  running,
  threadId,
}: {
  hydrating: boolean;
  latestTurnKey: string | null;
  organizationId: string;
  running: boolean;
  threadId: string;
}) {
  const savedOffset = useAgentChatStore(
    (state) => state.threadScrollOffsets[threadId],
  );
  const rememberOffset = useAgentChatStore(
    (state) => state.rememberThreadScrollOffset,
  );
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef(0);
  const contentHeightRef = useRef<number | null>(null);
  const conversationOffsetRef = useRef<number | null>(null);
  const scrollOffsetRef = useRef(0);
  const turnOffsetsRef = useRef(new Map<string, number>());
  const turnContentHeightsRef = useRef(new Map<string, number>());
  const latestTurnRef = useRef(latestTurnKey);
  const anchoredTurnRef = useRef<string | null>(null);
  const pendingAnchorRef = useRef<ReturnType<
    typeof createAnchorRequest
  > | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [showLatestButton, setShowLatestButton] = useState(false);
  latestTurnRef.current = latestTurnKey;

  const updateLatestButton = useCallback(() => {
    const key = latestTurnRef.current;
    const offset = key === null ? undefined : turnOffsetsRef.current.get(key);
    const height =
      key === null ? undefined : turnContentHeightsRef.current.get(key);
    const conversationOffset = conversationOffsetRef.current;
    setShowLatestButton(
      pendingAnchorRef.current === null &&
        viewportRef.current > 0 &&
        conversationOffset !== null &&
        offset !== undefined &&
        height !== undefined &&
        conversationOffset + offset + height >
          scrollOffsetRef.current +
            viewportRef.current +
            LATEST_CONTENT_VISIBILITY_TOLERANCE,
    );
  }, []);

  const applyPendingAnchor = useCallback(() => {
    const request = pendingAnchorRef.current;
    const viewport = viewportRef.current;
    const contentHeight = contentHeightRef.current;
    if (!request || viewport <= 0 || contentHeight === null) return;

    const maxOffset = Math.max(0, contentHeight - viewport);
    let target: number;
    if (request.offset !== null) {
      target = Math.min(Math.max(0, request.offset), maxOffset);
    } else {
      const offset = turnOffsetsRef.current.get(request.turnKey);
      const conversationOffset = conversationOffsetRef.current;
      if (offset === undefined || conversationOffset === null) return;
      target = Math.max(0, conversationOffset + offset - ANCHOR_TOP_INSET);
      // 최신 질문을 위에 놓을 수 있는 공간이 레이아웃에서 확정될 때까지 기다린다.
      if (maxOffset + 1 < target) return;
    }

    pendingAnchorRef.current = null;
    scrollOffsetRef.current = target;
    scrollRef.current?.scrollTo({ y: target, animated: request.animated });
    updateLatestButton();
  }, [updateLatestButton]);

  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      viewportRef.current = height;
      setViewportHeight(height);
      applyPendingAnchor();
      updateLatestButton();
    },
    [applyPendingAnchor, updateLatestButton],
  );

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      applyPendingAnchor();
      updateLatestButton();
    },
    [applyPendingAnchor, updateLatestButton],
  );

  const handleConversationLayout = useCallback(
    (event: LayoutChangeEvent) => {
      conversationOffsetRef.current = event.nativeEvent.layout.y;
      applyPendingAnchor();
      updateLatestButton();
    },
    [applyPendingAnchor, updateLatestButton],
  );

  const handleTurnLayout = useCallback(
    (key: string, event: LayoutChangeEvent) => {
      turnOffsetsRef.current.set(key, event.nativeEvent.layout.y);
      applyPendingAnchor();
      updateLatestButton();
    },
    [applyPendingAnchor, updateLatestButton],
  );

  const handleTurnContentLayout = useCallback(
    (key: string, event: LayoutChangeEvent) => {
      turnContentHeightsRef.current.set(key, event.nativeEvent.layout.height);
      updateLatestButton();
    },
    [updateLatestButton],
  );

  const handleScroll = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = Math.max(0, nativeEvent.contentOffset.y);
      updateLatestButton();
    },
    [updateLatestButton],
  );

  const commitOffset = useCallback(() => {
    if (anchoredTurnRef.current === null || pendingAnchorRef.current !== null)
      return;
    rememberOffset(organizationId, threadId, scrollOffsetRef.current);
  }, [organizationId, rememberOffset, threadId]);

  const scrollToLatest = useCallback(() => {
    const key = latestTurnRef.current;
    const offset = key === null ? undefined : turnOffsetsRef.current.get(key);
    const height =
      key === null ? undefined : turnContentHeightsRef.current.get(key);
    const conversationOffset = conversationOffsetRef.current;
    const contentHeight = contentHeightRef.current;
    const viewport = viewportRef.current;
    if (
      offset === undefined ||
      height === undefined ||
      conversationOffset === null ||
      contentHeight === null ||
      viewport <= 0
    ) {
      return;
    }
    const target = Math.min(
      Math.max(0, contentHeight - viewport),
      Math.max(
        0,
        conversationOffset +
          offset +
          height -
          viewport +
          LATEST_CONTENT_BOTTOM_INSET,
      ),
    );
    scrollOffsetRef.current = target;
    scrollRef.current?.scrollTo({ y: target, animated: true });
    setShowLatestButton(false);
  }, []);

  useEffect(() => {
    if (hydrating || latestTurnKey === null) return;
    const previous = anchoredTurnRef.current;
    if (previous === latestTurnKey) return;
    anchoredTurnRef.current = latestTurnKey;
    // 완료된 대화에 재진입할 때는 읽던 위치를 복원하고, 새 질문은 한 번만 위로 맞춘다.
    pendingAnchorRef.current = createAnchorRequest(
      latestTurnKey,
      previous !== null,
      previous === null && !running ? (savedOffset ?? null) : null,
    );
    applyPendingAnchor();
    updateLatestButton();
  }, [
    applyPendingAnchor,
    hydrating,
    latestTurnKey,
    running,
    savedOffset,
    updateLatestButton,
  ]);

  useEffect(() => () => commitOffset(), [commitOffset]);

  return {
    latestTurnMinHeight:
      viewportHeight > 0
        ? Math.max(0, viewportHeight - ANCHOR_TOP_INSET)
        : undefined,
    scrollRef,
    handleViewportLayout,
    handleContentSizeChange,
    handleConversationLayout,
    handleTurnLayout,
    handleTurnContentLayout,
    handleScroll,
    commitOffset,
    scrollToLatest,
    showLatestButton,
  };
}

function createAnchorRequest(
  turnKey: string,
  animated: boolean,
  offset: number | null,
) {
  return { turnKey, animated, offset };
}
