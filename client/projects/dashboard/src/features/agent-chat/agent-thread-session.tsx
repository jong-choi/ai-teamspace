import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import type { AgentModelInfo } from '@repo/client/api-client/schemas';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { useAgentChatPlatform } from '@core/features/agent-chat/agent-chat-platform';
import { useAgentChatStore } from '@core/features/agent-chat/agent-chat-provider';
import {
  getAgentThreadQueryKey,
  getAgentThreadsQueryKey,
} from '@core/features/agent-chat/agent-thread-query';
import { AgentChatNotice } from '@core/features/agent-chat/components/agent-chat-notice';
import { AgentComposer } from '@core/features/agent-chat/components/agent-composer';
import { AgentConversation } from '@core/features/agent-chat/components/agent-conversation';
import {
  AgentHitlCard,
  AgentHitlUnsupported,
} from '@core/features/agent-chat/components/agent-hitl-card';
import { mapAgentChatError } from '@core/features/agent-chat/lib/agent-chat-errors';
import {
  getAgentDraftKey,
  resolveAgentReasoningEffort,
} from '@core/features/agent-chat/lib/agent-chat-store';
import { groupAgentChatTurns } from '@core/features/agent-chat/lib/agent-chat-turns';
import { AGENT_CLIENT_CONTEXT_CONFIGURABLE_KEY } from '@core/features/agent-chat/lib/agent-client-context';
import {
  type AgentHitlResumeDecision,
  parseAgentHitlInterrupts,
} from '@core/features/agent-chat/lib/agent-hitl';
import {
  agentAssistantId,
  agentMessagesKey,
} from '@core/features/agent-chat/lib/agent-protocol-client';
import { useStream } from '@core/features/agent-chat/lib/langgraph-sdk-runtime';
import { useAgentMutationEffects } from '@core/features/agent-chat/mutation-effects/use-agent-mutation-effects';
import { useAgentClientContext } from '@core/features/agent-chat/use-agent-client-context';

import type {
  DeepAgentTypeConfigLike,
  ResolveStreamInterface,
} from '@langchain/langgraph-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';

type WorkOsDeepAgent = {
  readonly '~agentTypes': DeepAgentTypeConfigLike;
  readonly '~deepAgentTypes': DeepAgentTypeConfigLike;
};

export type AgentChatStreamState = ResolveStreamInterface<WorkOsDeepAgent>;

/**
 * 선택된 thread 하나의 stream 수명을 소유한다. 패널이 닫혀도 mount가 유지되어
 * 실행, HITL 대기, 변경 영수증 반영이 계속 동작한다. thread를 바꾸면 key로 다시 mount한다.
 */
export function AgentThreadSession({
  model,
  organizationId,
  threadId,
  userId,
}: {
  model: AgentModelInfo;
  organizationId: string;
  threadId: string;
  userId: string;
}) {
  const selectedEffort = useAgentChatStore((state) => state.reasoningEffort);
  const pendingStarter = useAgentChatStore((state) => state.pendingStarter);
  const queue = useAgentChatStore((state) => state.queue);
  const draft = useAgentChatStore(
    (state) => state.drafts[getAgentDraftKey(threadId)] ?? '',
  );
  const actions = useAgentChatStore(
    useShallow((state) => ({
      consumeStarter: state.consumeStarter,
      enqueue: state.enqueue,
      removeQueued: state.removeQueued,
      failQueued: state.failQueued,
      setDraft: state.setDraft,
      setPendingApproval: state.setPendingApproval,
      setReasoningEffort: state.setReasoningEffort,
    })),
  );
  const { notifyError } = useDashboardPlatform();
  const { client, createRunMetadataStorage } = useAgentChatPlatform();
  const queryClient = useQueryClient();
  const runMetadataStorage = useMemo(
    () => createRunMetadataStorage({ organizationId, userId }),
    [createRunMetadataStorage, organizationId, userId],
  );
  const reconnectOnMount = useCallback(
    () => runMetadataStorage,
    [runMetadataStorage],
  );
  const invalidateThreadQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: getAgentThreadsQueryKey(userId, organizationId),
    });
    void queryClient.invalidateQueries({
      queryKey: getAgentThreadQueryKey(userId, organizationId, threadId),
    });
  }, [organizationId, queryClient, threadId, userId]);

  const stream = useStream<WorkOsDeepAgent>({
    assistantId: agentAssistantId,
    client,
    fetchStateHistory: false,
    messagesKey: agentMessagesKey,
    onFinish: invalidateThreadQueries,
    reconnectOnMount,
    threadId,
  });

  const [resumePending, setResumePending] = useState(false);
  const [stopPending, setStopPending] = useState(false);
  const reasoningEffort = resolveAgentReasoningEffort(selectedEffort, model);
  const clientContext = useAgentClientContext();
  const submitOptions = useMemo(
    () => ({
      config: {
        configurable: {
          reasoning_effort: reasoningEffort,
          [AGENT_CLIENT_CONTEXT_CONFIGURABLE_KEY]: clientContext,
        },
      },
      multitaskStrategy: 'reject' as const,
      streamResumable: true,
      streamSubgraphs: true,
    }),
    [clientContext, reasoningEffort],
  );

  const hydrated = !stream.isThreadLoading;
  const running = stream.isLoading;
  const awaitingDecision = stream.interrupts.length > 0;
  const hitl =
    awaitingDecision && !running
      ? parseAgentHitlInterrupts(stream.interrupts.map(({ value }) => value))
      : null;
  const hitlUnsupported = awaitingDecision && !running && !hitl;
  const turns = useMemo(
    () =>
      groupAgentChatTurns({
        messages: stream.messages,
        toolCalls: stream.toolCalls,
        getSubagent: (toolCallId) => {
          const subagent = stream.getSubagent(toolCallId);
          if (!subagent) return undefined;
          const type = subagent.toolCall.args.subagent_type;
          return {
            name: typeof type === 'string' ? type : '하위 Agent',
            status: subagent.status,
            toolCount: subagent.toolCalls.length,
          };
        },
      }),
    [stream],
  );
  const mutationEffects = useAgentMutationEffects({
    hydrated,
    organizationId,
    threadId,
    toolCalls: stream.toolCalls,
  });

  const notifyActionError = useCallback(
    (
      id: string,
      error: unknown,
      context: Parameters<typeof mapAgentChatError>[1],
    ) => {
      const presentation = mapAgentChatError(error, context);
      notifyError({
        id: `${id}:${threadId}`,
        title: presentation.title,
        description: presentation.description,
      });
    },
    [notifyError, threadId],
  );

  const startRun = useCallback(
    (message: string): Promise<void> =>
      stream.submit(
        { messages: [{ type: 'human', content: message }] },
        submitOptions,
      ),
    [stream, submitOptions],
  );

  // 새 대화의 첫 메시지는 thread hydration이 끝난 뒤 한 번만 보낸다.
  const starter =
    pendingStarter?.threadId === threadId ? pendingStarter.message : null;
  const starterSent = useRef(false);
  useEffect(() => {
    if (!starter || !hydrated || starterSent.current) return;
    starterSent.current = true;
    actions.consumeStarter(threadId);
    startRun(starter).catch((error: unknown) =>
      notifyActionError('agent-starter', error, 'run'),
    );
  }, [actions, hydrated, notifyActionError, startRun, starter, threadId]);

  // 실행이 끝나고 승인 대기가 없으면 큐의 다음 메시지를 보낸다.
  const nextQueued = queue.find(
    (entry) => entry.threadId === threadId && entry.status === 'pending',
  );
  const draining = useRef(false);
  useEffect(() => {
    if (!hydrated || running || awaitingDecision || !nextQueued) return;
    if (draining.current) return;
    draining.current = true;
    actions.removeQueued(nextQueued.id);
    startRun(nextQueued.content)
      .catch((error: unknown) => {
        actions.failQueued(nextQueued);
        notifyActionError('agent-queue', error, 'run');
      })
      .finally(() => {
        draining.current = false;
      });
  }, [
    actions,
    awaitingDecision,
    hydrated,
    nextQueued,
    notifyActionError,
    running,
    startRun,
    threadId,
  ]);

  // 패널이 닫혀 있어도 승인 대기 배지를 보여 주기 위해 provider에 알린다.
  useEffect(() => {
    actions.setPendingApproval(awaitingDecision);
  }, [actions, awaitingDecision]);
  useEffect(() => () => actions.setPendingApproval(false), [actions]);

  const submit = async (message: string): Promise<boolean> => {
    if (running) {
      actions.enqueue({
        id: `${threadId}:${Date.now()}`,
        threadId,
        content: message,
      });
      return true;
    }
    startRun(message).catch((error: unknown) =>
      notifyActionError('agent-submit', error, 'run'),
    );
    return true;
  };

  const resume = async (resumeValue: {
    decisions: AgentHitlResumeDecision[];
  }) => {
    if (resumePending) return;
    setResumePending(true);
    try {
      await stream.submit(null, {
        ...submitOptions,
        command: { resume: resumeValue },
      });
    } catch (error) {
      notifyActionError('agent-hitl', error, 'hitl');
    } finally {
      setResumePending(false);
    }
  };

  const stop = async () => {
    if (stopPending) return;
    setStopPending(true);
    try {
      await stream.stop();
      invalidateThreadQueries();
    } catch (error) {
      notifyActionError('agent-stop', error, 'cancel');
    } finally {
      setStopPending(false);
    }
  };

  const streamError = stream.error
    ? mapAgentChatError(stream.error, 'stream')
    : null;

  return (
    <View className="min-h-0 flex-1">
      <AgentConversation
        footer={
          <>
            {streamError ? (
              <AgentChatNotice
                description={streamError.description}
                title={streamError.title}
                variant="destructive"
              />
            ) : null}
            {mutationEffects.failures.length > 0 ? (
              <AgentChatNotice
                action={{
                  label: '다시 시도',
                  onPress: () => void mutationEffects.retry(),
                }}
                description="Agent의 변경은 완료됐지만 열려 있는 화면을 갱신하지 못했습니다. 다시 시도하면 화면 데이터만 다시 불러옵니다."
                title="화면 갱신에 실패했습니다"
                variant="destructive"
              />
            ) : null}
            {hitl ? (
              <AgentHitlCard
                disabled={running}
                key={stream.interrupts.map(({ id }) => id).join('|')}
                onSubmit={(value) => void resume(value)}
                pending={resumePending}
                presentation={hitl}
              />
            ) : hitlUnsupported ? (
              <AgentHitlUnsupported />
            ) : null}
          </>
        }
        hydrating={!hydrated}
        running={running}
        turns={turns}
      />
      <View className="shrink-0 border-t border-border/60 bg-background px-3 pb-3 pt-2">
        <AgentComposer
          blockedReason={
            awaitingDecision
              ? '승인 대기 중인 작업이 있어 새 메시지를 보낼 수 없습니다.'
              : null
          }
          busy={running || resumePending}
          draft={draft}
          onChangeDraft={(value) =>
            actions.setDraft(getAgentDraftKey(threadId), value)
          }
          onRemoveQueued={actions.removeQueued}
          onStop={() => void stop()}
          onSubmit={submit}
          queue={queue.filter((entry) => entry.threadId === threadId)}
          reasoning={{
            value: reasoningEffort,
            options: model.supportedReasoningEfforts,
            model: model.model,
            onChange: actions.setReasoningEffort,
          }}
          stopping={stopPending}
        />
      </View>
    </View>
  );
}
