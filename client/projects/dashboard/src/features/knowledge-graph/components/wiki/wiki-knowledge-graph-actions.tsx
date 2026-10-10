import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  getWikiKnowledgeGraphControllerStatusQueryKey,
  useWikiKnowledgeGraphControllerRefresh,
  useWikiKnowledgeGraphControllerStatusSuspense,
} from '@repo/client/api-client';
import type { WikiKnowledgeGraphStatus } from '@repo/client/api-client/generated/schemas/wikiKnowledgeGraphStatus.zod';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { wikiKnowledgeGraphStatusLabel } from '@core/features/knowledge-graph/lib/wiki-knowledge-graph-status';

import { QueryErrorResetBoundary, useQueryClient } from '@tanstack/react-query';
import { Network, RefreshCw } from 'lucide-react-native';

const WIKI_STATUS_POLL_MS = 2_000;
const IN_PROGRESS: ReadonlySet<WikiKnowledgeGraphStatus['status']> = new Set([
  'accepted',
  'queued',
  'running',
  'waiting',
]);

/** Wiki 헤더의 두 액션은 같은 문서 status 계약을 공유한다. */
export function WikiKnowledgeGraphActions({
  documentId,
  organizationId,
  savedOnServer,
}: {
  documentId: string;
  organizationId: string;
  savedOnServer: boolean;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          fallbackRender={({ resetErrorBoundary }) => (
            <Button
              accessibilityLabel="지식 그래프 상태를 다시 불러오기"
              className="h-8 gap-1 px-2"
              onPress={resetErrorBoundary}
              size="sm"
              variant="ghost"
            >
              <Icon as={RefreshCw} className="size-4 text-destructive" />
              <Text className="hidden text-xs text-destructive sm:flex">
                상태 확인 실패
              </Text>
            </Button>
          )}
          onReset={reset}
          resetKeys={[organizationId, documentId]}
        >
          <Suspense fallback={<WikiActionsLoading />}>
            <WikiKnowledgeGraphLoadedActions
              documentId={documentId}
              organizationId={organizationId}
              savedOnServer={savedOnServer}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

function WikiActionsLoading() {
  return (
    <View className="flex-row items-center gap-1">
      <Button className="h-8 w-8" disabled size="icon" variant="ghost">
        <Icon as={Network} className="size-4 text-muted-foreground" />
      </Button>
      <WikiKnowledgeGraphRefreshButton
        disabled
        label={null}
        onPress={() => undefined}
      />
    </View>
  );
}

function WikiKnowledgeGraphLoadedActions({
  documentId,
  organizationId,
  savedOnServer,
}: {
  documentId: string;
  organizationId: string;
  savedOnServer: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useMutationErrorNotification({
    fallback: '지식 그래프 갱신을 요청하지 못했습니다.',
    id: 'knowledge-graph-wiki-refresh',
    title: '갱신 요청 실패',
  });
  const statusQuery = useWikiKnowledgeGraphControllerStatusSuspense(
    organizationId,
    documentId,
    {
      query: {
        refetchInterval: (query) =>
          query.state.data && IN_PROGRESS.has(query.state.data.status)
            ? WIKI_STATUS_POLL_MS
            : false,
      },
    },
  );
  const status = statusQuery.data;
  const refresh = useWikiKnowledgeGraphControllerRefresh({
    mutation: {
      onError: notifyError,
      onSuccess: () => {
        notifySuccess({
          title: '갱신 요청됨',
          description: '저장된 문서를 기준으로 지식 그래프를 다시 만듭니다.',
        });
        return queryClient.invalidateQueries({
          queryKey: getWikiKnowledgeGraphControllerStatusQueryKey(
            organizationId,
            documentId,
          ),
        });
      },
    },
  });
  const inProgress = IN_PROGRESS.has(status.status);
  const label = wikiKnowledgeGraphStatusLabel(
    status.status,
    Boolean(status.latestRequest?.satisfied),
    status.errorCode,
  );

  return (
    <View className="flex-row items-center gap-1">
      <Button
        accessibilityLabel="그래프 보기"
        className="h-8 w-8"
        onPress={() =>
          router.push({
            pathname: '/knowledge-graph',
            params: {
              focusKind: 'wiki_document',
              focusId: status.graphNodeId,
            },
          })
        }
        size="icon"
        variant="ghost"
      >
        <Icon as={Network} className="size-4 text-muted-foreground" />
      </Button>
      <WikiKnowledgeGraphRefreshButton
        busy={inProgress || refresh.isPending}
        disabled={!savedOnServer || inProgress || refresh.isPending}
        label={savedOnServer ? label : '저장 후 업데이트 가능'}
        onPress={() => refresh.mutate({ organizationId, documentId, data: {} })}
        tone={status.status === 'failed' ? 'error' : 'default'}
      />
    </View>
  );
}

function WikiKnowledgeGraphRefreshButton({
  busy = false,
  disabled,
  label,
  onPress,
  tone = 'default',
}: {
  busy?: boolean;
  disabled: boolean;
  label: string | null;
  onPress: () => void;
  tone?: 'default' | 'error';
}) {
  return (
    <Button
      accessibilityLabel={
        label
          ? `지식 그래프 지금 업데이트, ${label}`
          : '지식 그래프 지금 업데이트'
      }
      accessibilityState={{ busy, disabled }}
      className="h-8 gap-1 px-2"
      disabled={disabled}
      onPress={onPress}
      size="sm"
      variant="ghost"
    >
      <Icon
        as={RefreshCw}
        className={cn(
          'size-4',
          tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        )}
      />
      {label ? (
        <Text
          className={cn(
            'hidden text-xs sm:flex',
            tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {label}
        </Text>
      ) : null}
    </Button>
  );
}
