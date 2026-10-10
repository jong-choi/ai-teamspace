import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Select, SelectContent } from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { Textarea } from '@repo/client/rnr/components/ui/textarea';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  DashboardSelectItem,
  DashboardSelectTrigger,
  DashboardSelectValue,
} from '@core/app/ui/dashboard-select';
import { agentComposerSubmitsOnEnter } from '@core/features/agent-chat/components/agent-composer-key-handler';
import {
  AGENT_CHAT_QUEUE_LIMIT,
  type AgentQueuedMessage,
  type AgentReasoningEffort,
} from '@core/features/agent-chat/lib/agent-chat-store';
import { isAgentComposerSubmitKey } from '@core/features/agent-chat/lib/agent-composer-keys';

import {
  ArrowUp,
  Brain,
  Clock3,
  ListPlus,
  Square,
  X,
} from 'lucide-react-native';

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 160;

const reasoningLabels: Record<AgentReasoningEffort, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
};

export type AgentComposerReasoning = {
  value: AgentReasoningEffort;
  options: readonly AgentReasoningEffort[];
  model: string;
  onChange: (value: AgentReasoningEffort) => void;
};

export function AgentComposer({
  blockedReason = null,
  busy = false,
  draft,
  onChangeDraft,
  onRemoveQueued,
  onStop,
  onSubmit,
  queue = [],
  reasoning,
  stopping = false,
}: {
  blockedReason?: string | null;
  busy?: boolean;
  draft: string;
  onChangeDraft: (value: string) => void;
  onRemoveQueued?: (id: string) => void;
  onStop?: () => void;
  onSubmit: (message: string) => Promise<boolean>;
  queue?: readonly AgentQueuedMessage[];
  reasoning: AgentComposerReasoning;
  stopping?: boolean;
}) {
  const [height, setHeight] = useState(MIN_INPUT_HEIGHT);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const blocked = blockedReason !== null;
  const queueFull = busy && queue.length >= AGENT_CHAT_QUEUE_LIMIT;
  const canSend = draft.trim().length > 0 && !blocked && !queueFull;

  const submit = async () => {
    const message = draft.trim();
    if (!message || blocked || queueFull || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (await onSubmit(message)) {
        onChangeDraft('');
        setHeight(MIN_INPUT_HEIGHT);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View className="mx-auto w-full max-w-2xl gap-2">
      {queue.length > 0 ? (
        <View className="gap-1">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-xs text-muted-foreground">대기 메시지</Text>
            <Text className="text-xs text-muted-foreground">
              {queue.length}/{AGENT_CHAT_QUEUE_LIMIT}
            </Text>
          </View>
          {queue.map((entry) => (
            <View
              className={cn(
                'flex-row items-center gap-2 rounded-lg border px-2.5 py-1.5',
                entry.status === 'failed'
                  ? 'border-destructive/30 bg-destructive/5'
                  : 'border-border/60 bg-muted/30',
              )}
              key={entry.id}
            >
              <Icon
                as={Clock3}
                className={cn(
                  'size-3',
                  entry.status === 'failed'
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              />
              <Text
                className={cn(
                  'min-w-0 flex-1 text-xs',
                  entry.status === 'failed'
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
                numberOfLines={1}
              >
                {entry.status === 'failed' ? '전송 실패 · ' : ''}
                {entry.content}
              </Text>
              {onRemoveQueued ? (
                <Button
                  accessibilityLabel="대기 메시지 제거"
                  className="h-5 w-5"
                  onPress={() => onRemoveQueued(entry.id)}
                  size="icon"
                  variant="ghost"
                >
                  <Icon as={X} className="size-3 text-muted-foreground" />
                </Button>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {blockedReason ? (
        <Text className="px-1 text-xs text-amber-700 dark:text-amber-400">
          {blockedReason}
        </Text>
      ) : null}

      <View className="rounded-xl border border-border/70 bg-muted/20">
        <Textarea
          accessibilityLabel="Agent에게 보낼 메시지"
          className="border-0 bg-transparent px-3.5 pt-3 text-sm shadow-none web:focus-visible:ring-0 md:text-sm dark:bg-transparent"
          editable={!blocked}
          numberOfLines={1}
          onChangeText={onChangeDraft}
          onContentSizeChange={(event) =>
            setHeight(
              Math.min(
                MAX_INPUT_HEIGHT,
                Math.max(
                  MIN_INPUT_HEIGHT,
                  Math.ceil(event.nativeEvent.contentSize.height),
                ),
              ),
            )
          }
          onKeyPress={
            agentComposerSubmitsOnEnter
              ? (event) => {
                  if (!isAgentComposerSubmitKey(event.nativeEvent)) return;
                  event.preventDefault();
                  void submit();
                }
              : undefined
          }
          placeholder={
            blocked
              ? '승인 결정을 먼저 전달해 주세요'
              : 'Work OS에 대해 묻거나 작업을 요청하세요...'
          }
          style={{ height }}
          value={draft}
        />
        <View className="flex-row items-center justify-between gap-2 px-2 pb-2">
          <Select
            onValueChange={(option) => {
              const next = reasoning.options.find(
                (value) => value === option?.value,
              );
              if (next) reasoning.onChange(next);
            }}
            value={{
              label: reasoningLabels[reasoning.value],
              value: reasoning.value,
            }}
          >
            <DashboardSelectTrigger
              accessibilityLabel="추론 수준 선택"
              className="h-7 gap-1 border-transparent bg-transparent px-2 shadow-none dark:bg-transparent"
              size="sm"
            >
              <View className="flex-row items-center gap-1.5">
                <Icon
                  aria-hidden
                  as={Brain}
                  className="size-3.5 text-muted-foreground"
                />
                <DashboardSelectValue
                  className="text-muted-foreground"
                  placeholder="추론 수준"
                />
              </View>
            </DashboardSelectTrigger>
            <SelectContent align="start">
              {reasoning.options.map((value) => (
                <DashboardSelectItem
                  key={value}
                  label={reasoningLabels[value]}
                  textClassName="text-xs text-muted-foreground"
                  value={value}
                >
                  {reasoningLabels[value]}
                </DashboardSelectItem>
              ))}
            </SelectContent>
          </Select>
          <Text
            className="min-w-0 flex-1 text-2xs text-muted-foreground"
            numberOfLines={1}
          >
            {reasoning.model}
          </Text>

          <View className="flex-row items-center gap-1.5">
            {busy && onStop ? (
              <Button
                accessibilityLabel={
                  stopping ? 'Agent 실행 중지 중' : 'Agent 실행 중지'
                }
                className="h-7 w-7"
                disabled={stopping}
                onPress={onStop}
                size="icon"
                variant="outline"
              >
                {stopping ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Icon as={Square} className="size-3" />
                )}
              </Button>
            ) : null}
            <Button
              accessibilityLabel={busy ? '대기열에 추가' : '메시지 보내기'}
              className={cn(
                'h-7 w-7',
                canSend ? 'bg-foreground' : 'bg-transparent',
              )}
              disabled={!canSend || submitting}
              onPress={() => void submit()}
              size="icon"
              variant={canSend ? 'default' : 'ghost'}
            >
              {submitting ? (
                <ActivityIndicator size="small" />
              ) : (
                <Icon
                  as={busy ? ListPlus : ArrowUp}
                  className={cn(
                    'size-3.5',
                    canSend ? 'text-background' : 'text-muted-foreground',
                  )}
                />
              )}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}
