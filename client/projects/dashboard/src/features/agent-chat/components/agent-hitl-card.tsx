import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { Textarea } from '@repo/client/rnr/components/ui/textarea';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  type AgentHitlDecisionDraft,
  type AgentHitlDecisionType,
  type AgentHitlPresentation,
  type AgentHitlResumeDecision,
  createAgentHitlResume,
  createDefaultAgentHitlDrafts,
} from '@core/features/agent-chat/lib/agent-hitl';

import { ShieldAlert } from 'lucide-react-native';

const decisionLabels: Record<AgentHitlDecisionType, string> = {
  approve: '승인',
  edit: '수정',
  reject: '거절',
};

export function AgentHitlCard({
  disabled,
  onSubmit,
  pending,
  presentation,
}: {
  disabled: boolean;
  onSubmit: (resume: { decisions: AgentHitlResumeDecision[] }) => void;
  pending: boolean;
  presentation: AgentHitlPresentation;
}) {
  const [drafts, setDrafts] = useState<AgentHitlDecisionDraft[]>(() =>
    createDefaultAgentHitlDrafts(presentation),
  );
  const [errors, setErrors] = useState<Record<number, string>>({});

  const updateDraft = (
    index: number,
    patch: Partial<AgentHitlDecisionDraft>,
  ) => {
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  };

  const submit = () => {
    const result = createAgentHitlResume(presentation, drafts);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.resume);
  };

  return (
    <View
      accessibilityLabel="Agent 작업 승인 요청"
      className="w-full rounded-xl border border-amber-500/40 bg-amber-500/5"
    >
      <View className="flex-row items-center gap-2 border-b border-amber-500/20 px-3.5 py-2.5">
        <Icon
          as={ShieldAlert}
          className="size-4 text-amber-600 dark:text-amber-400"
        />
        <Text className="text-sm font-medium">작업 확인이 필요합니다</Text>
      </View>

      <View className="gap-3 p-3">
        {presentation.actions.map((action, index) => {
          const draft = drafts[index];
          if (!draft) return null;
          const error = errors[index];

          return (
            <View
              className="gap-2 rounded-lg border border-border bg-background p-3"
              key={`${action.name}:${index}`}
            >
              <View className="gap-0.5">
                <Text className="text-xs font-semibold">{action.label}</Text>
                {action.description ? (
                  <Text className="text-[11px] leading-4 text-muted-foreground">
                    {action.description}
                  </Text>
                ) : null}
              </View>

              {action.arguments.length > 0 ? (
                <View className="gap-0.5 rounded-md bg-muted/40 px-2.5 py-2">
                  {action.arguments.map((argument) => (
                    <Text
                      className="text-[11px] leading-4 text-muted-foreground"
                      key={argument.key}
                    >
                      {argument.key}: {argument.value}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View
                accessibilityRole="radiogroup"
                className="flex-row flex-wrap gap-1 self-start rounded-lg border border-border/60 bg-muted/30 p-1"
              >
                {action.allowedDecisions.map((decision) => {
                  const active = draft.type === decision;
                  return (
                    <Button
                      accessibilityLabel={`${action.label} ${decisionLabels[decision]}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active, disabled }}
                      className={cn(
                        'h-7 px-2.5',
                        active && 'bg-background shadow-sm',
                      )}
                      disabled={disabled}
                      key={decision}
                      onPress={() => updateDraft(index, { type: decision })}
                      size="sm"
                      variant="ghost"
                    >
                      <Text
                        className={cn(
                          'text-xs',
                          active ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {decisionLabels[decision]}
                      </Text>
                    </Button>
                  );
                })}
              </View>

              {draft.type === 'edit' ? (
                <Textarea
                  accessibilityLabel={`${action.label} 수정 인자 JSON`}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="min-h-24 font-mono text-xs"
                  editable={!disabled}
                  onChangeText={(value) =>
                    updateDraft(index, { editedArgsText: value })
                  }
                  value={draft.editedArgsText}
                />
              ) : null}

              {draft.type === 'reject' ? (
                <Textarea
                  accessibilityLabel={`${action.label} 거절 사유`}
                  className="min-h-16 text-xs"
                  editable={!disabled}
                  onChangeText={(value) =>
                    updateDraft(index, { rejectMessage: value })
                  }
                  placeholder="거절 사유 (선택)"
                  value={draft.rejectMessage}
                />
              ) : null}

              {error ? (
                <Text className="text-[11px] text-destructive" role="alert">
                  {error}
                </Text>
              ) : null}
            </View>
          );
        })}

        <View className="flex-row justify-end">
          <Button
            accessibilityLabel="결정 전달"
            disabled={disabled || pending}
            onPress={submit}
            size="sm"
          >
            {pending ? <ActivityIndicator size="small" /> : null}
            <Text className="text-xs text-primary-foreground">
              {pending ? '전달 중...' : '결정 전달'}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  );
}

export function AgentHitlUnsupported() {
  return (
    <View className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      <Text className="text-sm font-medium">사용자 결정이 필요합니다</Text>
      <Text className="mt-1 text-xs leading-5 text-muted-foreground">
        이 승인 요청 형식은 Dashboard가 안전하게 해석할 수 없습니다. 임의 결정을
        보내지 않았습니다.
      </Text>
    </View>
  );
}
