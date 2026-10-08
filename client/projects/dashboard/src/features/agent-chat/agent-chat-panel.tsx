import { useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAgentModelControllerGetModelInfoSuspense } from '@repo/client/api-client';
import type { AgentModelInfo } from '@repo/client/api-client/schemas';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { useAgentChatPlatform } from '@core/features/agent-chat/agent-chat-platform';
import { useAgentChatStore } from '@core/features/agent-chat/agent-chat-provider';
import {
  getAgentThreadsQueryKey,
  useAgentActiveOrganization,
  useAgentThread,
  useAgentThreads,
} from '@core/features/agent-chat/agent-thread-query';
import { AgentThreadSession } from '@core/features/agent-chat/agent-thread-session';
import { AgentChatHeader } from '@core/features/agent-chat/components/agent-chat-header';
import { AgentChatHome } from '@core/features/agent-chat/components/agent-chat-home';
import { AgentChatCenteredNotice } from '@core/features/agent-chat/components/agent-chat-notice';
import { AgentComposer } from '@core/features/agent-chat/components/agent-composer';
import { AgentThreadList } from '@core/features/agent-chat/components/agent-thread-list';
import {
  AGENT_CHAT_NEW_THREAD_KEY,
  resolveAgentReasoningEffort,
} from '@core/features/agent-chat/lib/agent-chat-store';
import { agentGraphId } from '@core/features/agent-chat/lib/agent-protocol-client';
import {
  agentThreadFallbackTitle,
  deriveAgentThreadTitle,
} from '@core/features/agent-chat/lib/agent-thread-title';
import { useAgentChatWideLayout } from '@core/features/agent-chat/lib/use-agent-chat-layout';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';

import { useQueryClient } from '@tanstack/react-query';

/**
 * 공통 업무 layout에 한 번만 배치되는 Agent 채팅 패널이다.
 * - 웹 lg 이상: 우측 고정 폭 패널, 확장하면 thread 목록 열과 본문을 가진 페이지형
 * - lg 미만: 메인 영역 전체(확장 없음)
 * 처음 연 뒤에는 닫아도 숨기기만 해서 stream, draft, 스크롤을 유지한다.
 * 너비가 바뀌는 transition은 쓰지 않는다.
 */
export function AgentChatPanel() {
  const open = useAgentChatStore((state) => state.open);
  const everOpened = useAgentChatStore((state) => state.everOpened);
  const storedExpanded = useAgentChatStore((state) => state.expanded);
  const title = useAgentChatStore((state) => state.activeThreadTitle);
  const closePanel = useAgentChatStore((state) => state.closePanel);
  const setExpanded = useAgentChatStore((state) => state.setExpanded);
  const newThread = useAgentChatStore((state) => state.newThread);
  const wide = useAgentChatWideLayout();
  const insets = useSafeAreaInsets();
  const expanded = wide && storedExpanded;
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || wide || !open) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        closePanel();
        return true;
      },
    );
    return () => subscription.remove();
  }, [closePanel, open, wide]);

  if (!everOpened) return null;

  return (
    <KeyboardAvoidingView
      accessibilityLabel="Agent 채팅 패널"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className={cn(
        'min-h-0 flex-col bg-background',
        wide
          ? expanded
            ? 'min-w-0 flex-1'
            : 'w-[400px] shrink-0 border-l border-border'
          : 'min-w-0 flex-1',
        !open && 'hidden',
      )}
      style={wide ? undefined : { paddingBottom: insets.bottom }}
    >
      <AgentChatHeader
        expanded={expanded}
        listOpen={listOpen}
        onClose={closePanel}
        onNewThread={() => {
          setListOpen(false);
          newThread();
        }}
        onToggleExpand={() => setExpanded(!storedExpanded)}
        onToggleList={() => setListOpen((current) => !current)}
        showExpand={wide}
        showListToggle={!expanded}
        title={title ?? 'Work OS Agent'}
      />
      <AgentChatBody
        expanded={expanded}
        listOpen={listOpen && !expanded}
        onCloseList={() => setListOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

function AgentChatBody(props: {
  expanded: boolean;
  listOpen: boolean;
  onCloseList: () => void;
}) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return <DashboardLoading label="세션을 확인하는 중..." />;
  }
  if (!currentUserId) {
    return <AuthenticationRequiredState />;
  }

  return (
    <DashboardQueryBoundary
      fallback={<DashboardLoading label="Agent를 준비하는 중..." />}
      resetKeys={[currentUserId]}
      title="Agent를 준비하지 못했습니다"
    >
      <AgentChatOrganizationGate {...props} userId={currentUserId} />
    </DashboardQueryBoundary>
  );
}

function AgentChatOrganizationGate({
  userId,
  ...props
}: {
  expanded: boolean;
  listOpen: boolean;
  onCloseList: () => void;
  userId: string;
}) {
  const scopedOrganizationId = useAgentChatStore(
    (state) => state.organizationId,
  );
  const setOrganization = useAgentChatStore((state) => state.setOrganization);
  const organization = useAgentActiveOrganization().data;
  const model = useAgentModelControllerGetModelInfoSuspense().data;
  const organizationId = organization?.organization.id ?? null;

  useEffect(() => {
    if (organizationId) setOrganization(organizationId);
  }, [organizationId, setOrganization]);

  if (!organizationId) {
    return (
      <AgentChatCenteredNotice
        description="Agent는 활성 조직 범위에서 동작합니다. 조직을 선택한 뒤 다시 열어 주세요."
        title="활성 조직이 없습니다"
      />
    );
  }
  // 조직 전환 직후에는 이전 조직의 thread를 열지 않도록 상태 정리를 기다린다.
  if (scopedOrganizationId !== organizationId) {
    return <DashboardLoading label="Agent를 준비하는 중..." />;
  }

  return (
    <AgentChatWorkspace
      {...props}
      key={organizationId}
      model={model}
      organizationId={organizationId}
      userId={userId}
    />
  );
}

function AgentChatWorkspace({
  expanded,
  listOpen,
  model,
  onCloseList,
  organizationId,
  userId,
}: {
  expanded: boolean;
  listOpen: boolean;
  model: AgentModelInfo;
  onCloseList: () => void;
  organizationId: string;
  userId: string;
}) {
  const threadId = useAgentChatStore((state) => state.activeThreadId);
  const threadList = (
    <DashboardQueryBoundary
      fallback={<DashboardLoading label="대화 목록을 불러오는 중..." />}
      resetKeys={[organizationId, userId]}
      title="대화 목록을 불러오지 못했습니다"
    >
      <AgentThreadListSection
        activeThreadId={threadId}
        onSelected={onCloseList}
        organizationId={organizationId}
        userId={userId}
      />
    </DashboardQueryBoundary>
  );

  return (
    <View className="relative min-h-0 flex-1 flex-row">
      {expanded ? (
        <View className="w-64 shrink-0 border-r border-border bg-sidebar">
          {threadList}
        </View>
      ) : null}
      <View className="min-h-0 min-w-0 flex-1">
        {threadId ? (
          <DashboardQueryBoundary
            fallback={<DashboardLoading label="Agent 대화를 불러오는 중..." />}
            resetKeys={[organizationId, threadId, userId]}
            title="Agent 대화를 열 수 없습니다"
          >
            <AgentThreadGate
              key={threadId}
              model={model}
              organizationId={organizationId}
              threadId={threadId}
              userId={userId}
            />
          </DashboardQueryBoundary>
        ) : (
          <AgentNewThread
            model={model}
            organizationId={organizationId}
            userId={userId}
          />
        )}
      </View>
      {listOpen ? (
        <View className="absolute inset-0 z-10 bg-background">
          {threadList}
        </View>
      ) : null}
    </View>
  );
}

function AgentThreadListSection(props: {
  activeThreadId: string | null;
  onSelected: () => void;
  organizationId: string;
  userId: string;
}) {
  const selectThread = useAgentChatStore((state) => state.selectThread);
  const threads = useAgentThreads(props.userId, props.organizationId).data;
  return (
    <AgentThreadList
      activeThreadId={props.activeThreadId}
      onSelectThread={(id, title) => {
        selectThread(id, title);
        props.onSelected();
      }}
      threads={threads}
    />
  );
}

function AgentThreadGate(props: {
  model: AgentModelInfo;
  organizationId: string;
  threadId: string;
  userId: string;
}) {
  // 다른 사용자·조직의 thread면 서버가 거부하고 가장 가까운 ErrorBoundary가 표시한다.
  useAgentThread(props.userId, props.organizationId, props.threadId);
  return <AgentThreadSession {...props} />;
}

function AgentNewThread({
  model,
  organizationId,
  userId,
}: {
  model: AgentModelInfo;
  organizationId: string;
  userId: string;
}) {
  const draft = useAgentChatStore(
    (state) => state.drafts[AGENT_CHAT_NEW_THREAD_KEY] ?? '',
  );
  const selectedEffort = useAgentChatStore((state) => state.reasoningEffort);
  const setStoredDraft = useAgentChatStore((state) => state.setDraft);
  const startThread = useAgentChatStore((state) => state.startThread);
  const setReasoningEffort = useAgentChatStore(
    (state) => state.setReasoningEffort,
  );
  const { notifyError } = useDashboardPlatform();
  const { client } = useAgentChatPlatform();
  const queryClient = useQueryClient();
  const setDraft = (value: string) =>
    setStoredDraft(AGENT_CHAT_NEW_THREAD_KEY, value);

  const createThread = async (message: string): Promise<boolean> => {
    const title = deriveAgentThreadTitle(message);
    try {
      const thread = await client.threads.create({
        graphId: agentGraphId,
        metadata: { title },
      });
      startThread({
        threadId: thread.thread_id,
        title: title || agentThreadFallbackTitle,
        message,
      });
      void queryClient.invalidateQueries({
        queryKey: getAgentThreadsQueryKey(userId, organizationId),
      });
      return true;
    } catch {
      notifyError({
        id: 'agent-thread-create',
        title: 'Agent 대화를 만들지 못했습니다',
        description: '조직과 로그인 상태를 확인한 뒤 다시 시도해 주세요.',
      });
      return false;
    }
  };

  return (
    <View className="min-h-0 flex-1">
      <AgentChatHome onPickPrompt={setDraft} />
      <View className="shrink-0 px-3 pb-3 pt-2">
        <AgentComposer
          draft={draft}
          onChangeDraft={setDraft}
          onSubmit={createThread}
          reasoning={{
            value: resolveAgentReasoningEffort(selectedEffort, model),
            options: model.supportedReasoningEfforts,
            model: model.model,
            onChange: setReasoningEffort,
          }}
        />
      </View>
    </View>
  );
}
