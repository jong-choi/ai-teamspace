import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import type {
  AgentHitlDecision,
  AgentHitlPresentation,
} from '@core/features/agent-chat/lib/agent-hitl';

export type AgentToolActivity = {
  id: string;
  name: string;
  state: 'pending' | 'completed' | 'error';
};

export type AgentSubagentActivity = {
  id: string;
  name: string;
  status: string;
};

export function AgentRunActivity({
  hitl,
  hitlUnsupported,
  onDecision,
  resumePending,
  subagents,
  tools,
}: {
  hitl: AgentHitlPresentation | null;
  hitlUnsupported: boolean;
  onDecision: (decision: AgentHitlDecision) => void;
  resumePending: boolean;
  subagents: AgentSubagentActivity[];
  tools: AgentToolActivity[];
}) {
  if (
    tools.length === 0 &&
    subagents.length === 0 &&
    !hitl &&
    !hitlUnsupported
  ) {
    return null;
  }

  return (
    <View className="mx-auto w-full max-w-3xl gap-2 px-4 pb-3 sm:px-6">
      {tools.slice(-4).map((tool) => (
        <View
          className="flex-row items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
          key={tool.id}
        >
          <Text className="text-xs text-muted-foreground">
            도구 작업 · {safeTechnicalLabel(tool.name)}
          </Text>
          <Text className="text-[10px] font-medium text-muted-foreground">
            {toolStateLabel(tool.state)}
          </Text>
        </View>
      ))}

      {subagents.slice(-3).map((subagent) => (
        <View
          className="flex-row items-center justify-between rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2"
          key={subagent.id}
        >
          <Text className="text-xs text-muted-foreground">
            하위 Agent · {safeTechnicalLabel(subagent.name)}
          </Text>
          <Text className="text-[10px] font-medium text-muted-foreground">
            {subagent.status}
          </Text>
        </View>
      ))}

      {hitl ? (
        <View className="gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <View>
            <Text className="text-sm font-semibold">
              작업 확인이 필요합니다
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              Agent가 변경 작업을 실행하기 전에 승인을 기다리고 있습니다.
            </Text>
          </View>

          {hitl.actions.map((action, index) => (
            <View
              className="gap-1.5 rounded-lg border border-border bg-background/70 p-3"
              key={`${action.name}:${index}`}
            >
              <Text className="text-xs font-medium">
                {action.description ?? '이 작업을 실행합니다.'}
              </Text>
              <Text className="text-[10px] text-muted-foreground">
                작업 유형: {safeTechnicalLabel(action.name)}
              </Text>
              {action.arguments.map((argument) => (
                <Text
                  className="text-[10px] text-muted-foreground"
                  key={argument.key}
                >
                  {argument.key}: {argument.value}
                </Text>
              ))}
            </View>
          ))}

          <View className="flex-row justify-end gap-2">
            {hitl.canRejectAll ? (
              <Button
                accessibilityLabel="Agent 작업 모두 거절"
                disabled={resumePending}
                onPress={() => onDecision('reject')}
                size="sm"
                variant="outline"
              >
                <Text className="text-xs">거절</Text>
              </Button>
            ) : null}
            {hitl.canApproveAll ? (
              <Button
                accessibilityLabel="Agent 작업 모두 승인"
                disabled={resumePending}
                onPress={() => onDecision('approve')}
                size="sm"
              >
                <Text className="text-xs text-primary-foreground">
                  {resumePending ? '처리 중...' : '승인'}
                </Text>
              </Button>
            ) : null}
            {!hitl.canApproveAll && !hitl.canRejectAll ? (
              <Text className="text-xs text-muted-foreground">
                이 결정 조합은 현재 Dashboard에서 안전하게 처리할 수 없습니다.
              </Text>
            ) : null}
          </View>
        </View>
      ) : hitlUnsupported ? (
        <View className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <Text className="text-sm font-semibold">
            사용자 결정이 필요합니다
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            이 interrupt 형식은 현재 Dashboard가 안전하게 해석할 수 없습니다.
            임의 결정을 보내지 않았습니다.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function toolStateLabel(state: AgentToolActivity['state']): string {
  if (state === 'pending') return '실행 중';
  if (state === 'error') return '실패';
  return '완료';
}

function safeTechnicalLabel(value: string): string {
  return value.length <= 48 ? value : `${value.slice(0, 47)}…`;
}
