import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Badge } from '@repo/client/rnr/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@repo/client/rnr/components/ui/collapsible';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import type {
  AgentToolCallItem,
  AgentToolCallState,
} from '@core/features/agent-chat/lib/agent-chat-turns';

import type { SubagentStatus } from '@langchain/langgraph-sdk/react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Plug,
  Wrench,
} from 'lucide-react-native';

const stateLabels: Record<AgentToolCallState, string> = {
  pending: '실행 중',
  completed: '완료',
  error: '실패',
  rejected: '거부됨',
  denied: '권한 없음',
};

const subagentStatusLabels: Record<SubagentStatus, string> = {
  pending: '대기',
  running: '실행 중',
  complete: '완료',
  error: '실패',
};

export function AgentToolCallBlock({ item }: { item: AgentToolCallItem }) {
  const [open, setOpen] = useState(false);
  const external = item.source.kind === 'external';
  const hasDetails =
    item.fields.length > 0 ||
    item.resultDetails !== null ||
    item.state === 'denied' ||
    item.subagent !== null;

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <View className="w-full rounded-lg border border-border/60 bg-background">
        <CollapsibleTrigger
          accessibilityLabel={`${item.label} ${stateLabels[item.state]}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: open, disabled: !hasDetails }}
          className="flex-row items-center gap-2 px-3 py-2"
          disabled={!hasDetails}
        >
          <Icon
            as={open ? ChevronDown : ChevronRight}
            className={cn(
              'size-3 text-muted-foreground',
              !hasDetails && 'opacity-0',
            )}
          />
          <Icon
            as={item.subagent ? Bot : external ? Plug : Wrench}
            className="size-3 text-muted-foreground"
          />
          <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
            <Text
              className="shrink text-xs font-medium text-foreground"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.label}
              {item.subagent ? ` · ${item.subagent.name}` : ''}
            </Text>
            {item.resultSummary ? (
              <Text
                className="min-w-0 flex-1 text-xs font-normal text-muted-foreground"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.resultSummary}
              </Text>
            ) : null}
          </View>
          {external && item.source.kind === 'external' ? (
            <Badge className="px-1.5 py-0" variant="outline">
              <Text className="text-2xs font-normal text-muted-foreground">
                {item.source.namespace}
              </Text>
            </Badge>
          ) : null}
          <AgentToolStateBadge state={item.state} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <View className="gap-2 border-t border-border/50 px-3 py-2">
            {item.state === 'denied' ? (
              <Text className="text-xs leading-4 text-destructive">
                권한이 없어 실행되지 않았습니다. 조직 또는 개인 MCP 정책을
                확인해 주세요.
              </Text>
            ) : null}
            {item.subagent ? (
              <Text className="text-xs text-muted-foreground">
                하위 Agent {item.subagent.name} ·{' '}
                {subagentStatusLabels[item.subagent.status]} · 내부 도구{' '}
                {item.subagent.toolCount}개
              </Text>
            ) : null}
            {item.fields.length > 0 ? (
              <View className="gap-0.5">
                <Text className="text-2xs font-medium text-muted-foreground">
                  입력
                </Text>
                {item.fields.map((field, index) => (
                  <Text
                    className="text-xs leading-4 text-muted-foreground"
                    key={`${field.label}:${index}`}
                  >
                    {field.label}: {field.value}
                  </Text>
                ))}
              </View>
            ) : null}
            {item.resultDetails !== null ? (
              <View className="gap-0.5">
                <Text className="text-2xs font-medium text-muted-foreground">
                  결과
                </Text>
                <Text selectable className="text-xs leading-4 text-foreground">
                  {item.resultDetails}
                </Text>
              </View>
            ) : null}
          </View>
        </CollapsibleContent>
      </View>
    </Collapsible>
  );
}

function AgentToolStateBadge({ state }: { state: AgentToolCallState }) {
  if (state === 'pending') {
    return (
      <View className="flex-row items-center gap-1">
        <ActivityIndicator size="small" />
        <Text className="text-2xs text-muted-foreground">
          {stateLabels[state]}
        </Text>
      </View>
    );
  }

  return (
    <Badge
      className="px-1.5 py-0"
      variant={
        state === 'completed'
          ? 'secondary'
          : state === 'error'
            ? 'destructive'
            : 'outline'
      }
    >
      <Text className="text-2xs">{stateLabels[state]}</Text>
    </Badge>
  );
}
