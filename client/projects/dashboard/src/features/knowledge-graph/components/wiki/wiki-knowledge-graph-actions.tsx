import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import type { GraphFixtureWikiIndexStatus } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
// TODO(graph-05-orval): graph-05 Wiki refresh POST generated mutation hook으로 직접 교체한다.
import { useGraphFixtureWikiRefreshMutation } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-mutations';
// TODO(graph-05-orval): graph-05 Wiki status GET generated Suspense hook으로 직접 교체한다.
import { useGraphFixtureWikiIndexSuspense } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-queries';

import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Network, RefreshCw } from 'lucide-react-native';

const IN_PROGRESS: ReadonlySet<GraphFixtureWikiIndexStatus> = new Set([
  'accepted',
  'queued',
  'running',
]);

const STATUS_LABEL: Record<GraphFixtureWikiIndexStatus, string | null> = {
  not_indexed: '색인 전',
  accepted: '갱신 요청됨',
  queued: '갱신 대기 중',
  running: '그래프 갱신 중',
  up_to_date: null,
  stale: '갱신 필요',
  failed: '갱신 실패',
};

/**
 * Wiki 헤더의 두 독립 액션. 그래프 보기는 언제나 열 수 있고,
 * 지금 업데이트는 서버에 저장된 문서만 대상으로 하므로 저장 확인 전에는 막는다.
 */
export function WikiKnowledgeGraphActions({
  documentId,
  organizationId,
  savedOnServer,
}: {
  documentId: string;
  organizationId: string;
  savedOnServer: boolean;
}) {
  const router = useRouter();
  return (
    <View className="flex-row items-center gap-1">
      <Button
        accessibilityLabel="그래프 보기"
        className="h-8 w-8"
        onPress={() =>
          router.push({
            pathname: '/knowledge-graph',
            params: { focusKind: 'wiki_document', focusId: documentId },
          })
        }
        size="icon"
        variant="ghost"
      >
        <Icon as={Network} className="size-4 text-muted-foreground" />
      </Button>
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
                <Text className="hidden text-[11px] text-destructive sm:flex">
                  상태 확인 실패
                </Text>
              </Button>
            )}
            onReset={reset}
            resetKeys={[organizationId, documentId]}
          >
            <Suspense
              fallback={
                <WikiKnowledgeGraphRefreshButton
                  disabled
                  label={null}
                  onPress={() => undefined}
                />
              }
            >
              <WikiKnowledgeGraphRefresh
                documentId={documentId}
                organizationId={organizationId}
                savedOnServer={savedOnServer}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </View>
  );
}

function WikiKnowledgeGraphRefresh({
  documentId,
  organizationId,
  savedOnServer,
}: {
  documentId: string;
  organizationId: string;
  savedOnServer: boolean;
}) {
  const index = useGraphFixtureWikiIndexSuspense(
    organizationId,
    documentId,
  ).data;
  const refresh = useGraphFixtureWikiRefreshMutation(
    organizationId,
    documentId,
  );
  const inProgress = IN_PROGRESS.has(index.status);
  // 완료 표시는 이번 요청 이후의 status가 up_to_date일 때만 한다.
  const label =
    index.status === 'up_to_date' && index.requestedAt
      ? '업데이트 완료'
      : STATUS_LABEL[index.status];

  return (
    <WikiKnowledgeGraphRefreshButton
      busy={inProgress || refresh.isPending}
      disabled={!savedOnServer || inProgress || refresh.isPending}
      label={savedOnServer ? label : '저장 후 업데이트 가능'}
      onPress={() => refresh.mutate()}
      tone={index.status === 'failed' ? 'error' : 'default'}
    />
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
            'hidden text-[11px] sm:flex',
            tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {label}
        </Text>
      ) : null}
    </Button>
  );
}
