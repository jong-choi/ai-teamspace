import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { useAgentChatPlatform } from '@core/features/agent-chat/agent-chat-platform';
import {
  useAgentDelegation,
  useAgentDelegationMutations,
} from '@core/features/agent-chat/agent-delegation-query';
import type {
  AgentDelegationState,
  AgentDelegationStatus,
} from '@core/features/agent-chat/lib/agent-delegation-gateway';
import { getAgentReturnTo } from '@core/features/agent-chat/lib/agent-return-to';

export function AgentDelegationGate({
  children,
  organizationId,
  threadId,
  userId,
}: {
  children: ReactNode;
  organizationId: string;
  threadId?: string;
  userId: string;
}) {
  const state = useAgentDelegation(userId, organizationId).data;
  const { start, revoke, setState, refetch } = useAgentDelegationMutations(
    userId,
    organizationId,
  );
  const { openAuthorization } = useAgentChatPlatform();
  const { createAppUrl, notifyError, notifySuccess } = useDashboardPlatform();

  if (state.status === 'active') {
    return (
      <View className="min-h-0 flex-1">
        <View className="flex-row items-center justify-between gap-3 border-b border-border px-3 py-1.5">
          <Text className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            Work OS Agent 위임 활성 · 실제 도구 호출은 조직 MCP 정책과 현재
            권한을 다시 확인합니다.
          </Text>
          <Button
            disabled={revoke.isPending}
            onPress={() => {
              revoke.mutate(undefined, {
                onError: () =>
                  notifyError({
                    id: 'agent-delegation-revoke',
                    title: 'Agent 위임을 해제하지 못했습니다',
                    description:
                      '현재 연결 상태를 확인한 뒤 다시 시도해 주세요.',
                  }),
                onSuccess: () =>
                  notifySuccess({ title: 'Agent 위임 연결을 해제했습니다.' }),
              });
            }}
            size="sm"
            variant="ghost"
          >
            <Text className="text-[11px] text-muted-foreground">
              {revoke.isPending ? '해제 중...' : '위임 해제'}
            </Text>
          </Button>
        </View>
        {children}
      </View>
    );
  }

  const presentation = delegationPresentation(state.status);
  const canStart =
    state.status === 'not_connected' ||
    state.status === 'pending_consent' ||
    state.status === 'refresh_required' ||
    state.status === 'revoked';

  const connect = async () => {
    const returnTo = getAgentReturnTo(threadId);
    try {
      const result = await start.mutateAsync(returnTo);

      if (!result.authorizationUrl) {
        setState(toState(result));
        if (result.status === 'active') {
          notifySuccess({ title: 'Agent 위임 연결을 준비했습니다.' });
        }
        return;
      }

      const redirectUrl = createAppUrl(
        '/settings/mcp/consent?returnTo=' + encodeURIComponent(returnTo),
      );
      const browserResult = await openAuthorization({
        authorizationUrl: result.authorizationUrl,
        redirectUrl,
      });

      // The authorization URL is intentionally not stored in query/cache/state.
      if (browserResult.type === 'success') {
        await refetch();
        notifySuccess({ title: 'Agent 위임 상태를 새로 확인했습니다.' });
      }
    } catch {
      notifyError({
        id: 'agent-delegation-start',
        title: 'Agent 위임을 시작하지 못했습니다',
        description:
          '연결 상태를 확인한 뒤 다시 시도해 주세요. OAuth continuation은 저장하지 않았습니다.',
      });
    }
  };

  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="w-full max-w-md gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <View>
          <Text className="text-base font-semibold">{presentation.title}</Text>
          <Text className="mt-1 text-xs leading-5 text-muted-foreground">
            {presentation.description}
          </Text>
        </View>

        {state.grantedScopes.length > 0 ? (
          <Text className="text-[11px] text-muted-foreground">
            위임 scope {state.grantedScopes.length}개 · business 권한은 별도
            정책으로 제한될 수 있습니다.
          </Text>
        ) : null}

        {canStart ? (
          <Button disabled={start.isPending} onPress={() => void connect()}>
            <Text className="text-primary-foreground">
              {start.isPending ? '연결 중...' : presentation.actionLabel}
            </Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}

function toState(input: {
  status: AgentDelegationStatus;
  grantedScopes: string[];
  expiresAt: string | null;
}): AgentDelegationState {
  return {
    status: input.status,
    grantedScopes: input.grantedScopes,
    expiresAt: input.expiresAt,
  };
}

function delegationPresentation(status: AgentDelegationStatus): {
  title: string;
  description: string;
  actionLabel: string;
} {
  switch (status) {
    case 'not_connected':
      return {
        title: 'Work OS Agent 연결이 필요합니다',
        description:
          'Agent가 현재 조직의 도구를 사용하도록 사용자 위임을 연결합니다. access/refresh token은 Dashboard에 저장하거나 표시하지 않습니다.',
        actionLabel: 'Work OS Agent 연결',
      };
    case 'pending_consent':
      return {
        title: 'Agent 권한 동의가 진행 중입니다',
        description:
          '이전에 시작한 OAuth 동의를 계속하거나 새 authorization flow를 시작할 수 있습니다.',
        actionLabel: '동의 계속',
      };
    case 'refresh_required':
      return {
        title: 'Agent 위임을 다시 인증해야 합니다',
        description:
          '저장된 위임 credential을 현재 상태에서 갱신할 수 없습니다. 새 OAuth 동의로 다시 연결해 주세요.',
        actionLabel: '다시 연결',
      };
    case 'revoked':
      return {
        title: 'Agent 위임이 해제되었습니다',
        description:
          '다시 연결하기 전까지 Work OS Agent가 조직 도구를 사용할 수 없습니다.',
        actionLabel: '다시 연결',
      };
    case 'forbidden':
      return {
        title: 'Agent 위임을 사용할 권한이 없습니다',
        description:
          '현재 계정 또는 조직 정책에서 Agent 위임 사용이 허용되지 않습니다. 조직 관리자에게 확인해 주세요.',
        actionLabel: '연결 불가',
      };
    case 'no_membership':
      return {
        title: '현재 조직 멤버십이 필요합니다',
        description:
          '활성 조직을 다시 선택하거나 조직 멤버십을 확인한 뒤 Agent를 열어 주세요.',
        actionLabel: '연결 불가',
      };
    case 'active':
      return {
        title: 'Agent 위임 활성',
        description: 'Agent UI를 사용할 수 있습니다.',
        actionLabel: '연결됨',
      };
  }
}
