import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { useAgentChatPlatform } from '@core/features/agent-chat/agent-chat-platform';
import { AgentChatComposer } from '@core/features/agent-chat/components/agent-chat-composer';
import { AgentMessageList } from '@core/features/agent-chat/components/agent-message-list';
import { AgentRunActivity } from '@core/features/agent-chat/components/agent-run-activity';
import { mapAgentChatError } from '@core/features/agent-chat/lib/agent-chat-errors';
import {
  type AgentHitlDecision,
  createAgentHitlResume,
  parseAgentHitlPresentation,
} from '@core/features/agent-chat/lib/agent-hitl';
import {
  agentAssistantId,
  agentMessagesKey,
} from '@core/features/agent-chat/lib/agent-protocol-client';
import { projectAgentToolDisplay } from '@core/features/agent-chat/lib/agent-tool-display';

import {
  type DeepAgentTypeConfigLike,
  type ResolveStreamInterface,
  useStream,
} from '@langchain/langgraph-sdk/react';

type WorkOsDeepAgent = {
  readonly '~agentTypes': DeepAgentTypeConfigLike;
  readonly '~deepAgentTypes': DeepAgentTypeConfigLike;
};

export type AgentChatStreamState = ResolveStreamInterface<WorkOsDeepAgent>;

export function AgentChatStream({
  organizationId,
  threadId,
  userId,
  onRunFinished,
  starterMessage,
  onStarterStarted,
}: {
  organizationId: string;
  threadId: string;
  userId: string;
  onRunFinished?: () => void;
  starterMessage?: string | null;
  onStarterStarted?: () => void;
}) {
  const { notifyError } = useDashboardPlatform();
  const { client, createRunMetadataStorage } = useAgentChatPlatform();
  const runMetadataStorage = useMemo(
    () => createRunMetadataStorage({ organizationId, userId }),
    [createRunMetadataStorage, organizationId, userId],
  );
  const reconnectOnMount = useCallback(
    () => runMetadataStorage,
    [runMetadataStorage],
  );

  const stream = useStream<WorkOsDeepAgent>({
    assistantId: agentAssistantId,
    client,
    fetchStateHistory: false,
    messagesKey: agentMessagesKey,
    onFinish: () => onRunFinished?.(),
    reconnectOnMount,
    threadId,
  });
  const starterStartedRef = useRef(false);
  const [resumePending, setResumePending] = useState(false);
  const [stopPending, setStopPending] = useState(false);

  const hitl =
    stream.interrupts.length === 1
      ? parseAgentHitlPresentation(stream.interrupts[0]?.value)
      : null;
  const hitlUnsupported = stream.interrupts.length > 0 && !hitl;
  const toolActivities = stream.toolCalls.map((tool) => ({
    id: tool.id,
    state: tool.state,
    ...projectAgentToolDisplay({
      name: tool.call.name,
      args: tool.call.args,
      result: tool.result?.content,
    }),
  }));
  const subagentActivities = Array.from(stream.subagents.values()).map(
    (subagent) => ({
      id: subagent.id,
      name:
        typeof subagent.toolCall.args.subagent_type === 'string'
          ? subagent.toolCall.args.subagent_type
          : subagent.toolCall.name,
      status: subagent.status,
    }),
  );
  const streamErrorPresentation = stream.error
    ? mapAgentChatError(stream.error, 'stream')
    : null;

  useEffect(() => {
    if (
      !starterMessage ||
      stream.isThreadLoading ||
      starterStartedRef.current
    ) {
      return;
    }

    let submission: Promise<void>;
    try {
      submission = stream.submit(
        { messages: [{ type: 'human', content: starterMessage }] },
        {
          multitaskStrategy: 'reject',
          streamResumable: true,
          streamSubgraphs: true,
        },
      );
    } catch (error) {
      const presentation = mapAgentChatError(error, 'run');
      notifyError({
        id: `agent-starter:${threadId}`,
        title: presentation.title,
        description: presentation.description,
      });
      return;
    }

    starterStartedRef.current = true;
    onStarterStarted?.();

    void submission.catch((error) => {
      const presentation = mapAgentChatError(error, 'run');
      notifyError({
        id: `agent-starter:${threadId}`,
        title: presentation.title,
        description: presentation.description,
      });
    });
  }, [notifyError, onStarterStarted, starterMessage, stream, threadId]);

  const submit = async (message: string): Promise<boolean> => {
    try {
      await stream.submit(
        { messages: [{ type: 'human', content: message }] },
        {
          multitaskStrategy: 'reject',
          streamResumable: true,
          streamSubgraphs: true,
        },
      );
      return true;
    } catch (error) {
      const presentation = mapAgentChatError(error, 'run');
      notifyError({
        id: `agent-submit:${threadId}`,
        title: presentation.title,
        description: presentation.description,
      });
      return false;
    }
  };

  const resume = async (decision: AgentHitlDecision) => {
    if (!hitl || resumePending) return;

    setResumePending(true);
    try {
      await stream.submit(null, {
        command: { resume: createAgentHitlResume(hitl, decision) },
        multitaskStrategy: 'reject',
        streamResumable: true,
        streamSubgraphs: true,
      });
    } catch (error) {
      const presentation = mapAgentChatError(error, 'hitl');
      notifyError({
        id: `agent-hitl:${threadId}`,
        title: presentation.title,
        description: presentation.description,
      });
    } finally {
      setResumePending(false);
    }
  };

  const stop = async () => {
    if (stopPending) return;

    setStopPending(true);
    try {
      await stream.stop();
      onRunFinished?.();
    } catch (error) {
      const presentation = mapAgentChatError(error, 'cancel');
      notifyError({
        id: `agent-stop:${threadId}`,
        title: presentation.title,
        description: presentation.description,
      });
    } finally {
      setStopPending(false);
    }
  };

  return (
    <View className="min-h-0 flex-1 bg-background">
      {streamErrorPresentation ? (
        <View className="border-b border-destructive/20 bg-destructive/5 px-4 py-2">
          <Text className="text-xs font-medium text-destructive">
            {streamErrorPresentation.title}
          </Text>
          <Text className="mt-0.5 text-[11px] text-destructive">
            {streamErrorPresentation.description}
          </Text>
        </View>
      ) : null}
      <AgentMessageList messages={stream.messages} />
      <AgentRunActivity
        hitl={hitl}
        hitlUnsupported={hitlUnsupported}
        onDecision={(decision) => void resume(decision)}
        resumePending={resumePending}
        subagents={subagentActivities}
        tools={toolActivities}
      />
      <AgentChatComposer
        busy={stream.isLoading || stopPending}
        disabled={stream.interrupts.length > 0 || resumePending || stopPending}
        onStop={() => void stop()}
        onSubmit={submit}
        stopping={stopPending}
      />
    </View>
  );
}
