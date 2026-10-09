import { type ReactNode, Suspense, useDeferredValue } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  useKnowledgeGraphControllerListEdgesSuspense,
  useKnowledgeGraphControllerListNodesSuspense,
} from '@repo/client/api-client';
import { Badge } from '@repo/client/rnr/components/ui/badge';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { GraphDataFilterBar } from '@core/features/knowledge-graph/components/data-center/graph-data-filter-bar';
import {
  GRAPH_EDGE_TABLE_COLUMNS,
  GraphEdgeTable,
} from '@core/features/knowledge-graph/components/data-center/graph-edge-table';
import {
  GRAPH_NODE_TABLE_COLUMNS,
  GraphNodeTable,
} from '@core/features/knowledge-graph/components/data-center/graph-node-table';
import { GraphTableSkeleton } from '@core/features/knowledge-graph/components/data-center/graph-table';
import type { GraphDataCenterParams } from '@core/features/knowledge-graph/lib/graph-route-params';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import {
  Database,
  GitCommit,
  Link2,
  type LucideIcon,
  Plus,
} from 'lucide-react-native';

const ALL_KINDS = 'all';

export function GraphDataCenter({
  onParamsChange,
  organizationId,
  params,
}: {
  onParamsChange: (params: GraphDataCenterParams) => void;
  organizationId: string;
  params: GraphDataCenterParams;
}) {
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  // 새 page가 준비될 때까지 이전 표를 유지해 skeleton 깜빡임을 줄인다.
  const deferredParams = useDeferredValue(params);
  const stale = deferredParams !== params;
  // 검색·필터·page size가 바뀌면 cursor를 처음으로 되돌린다.
  const change = (patch: Partial<GraphDataCenterParams>) =>
    onParamsChange({ ...params, cursor: null, ...patch });

  return (
    <ScrollView
      className="min-h-0 flex-1 bg-muted/30"
      contentContainerClassName="p-4 md:p-8"
    >
      <View className="mx-auto w-full max-w-7xl">
        <View className="mb-6 flex-row flex-wrap items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-xl font-bold tracking-tight">
              지식 그래프 데이터 관리자
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              노드(Entities)와 관계(Relationships) 데이터를 별도 모드로 분리하여
              효율적으로 관리합니다.
            </Text>
          </View>
          <Button
            className="rounded-lg"
            onPress={() =>
              openDialog(
                params.tab === 'nodes'
                  ? { type: 'node-create' }
                  : { type: 'edge-create', sourceNodeId: null },
              )
            }
            size="sm"
          >
            <Icon
              as={params.tab === 'nodes' ? Plus : Link2}
              className="size-4 text-primary-foreground"
            />
            <Text className="text-xs">
              {params.tab === 'nodes' ? '신규 노드 작성' : '신규 관계 연결'}
            </Text>
          </Button>
        </View>

        {/* 좁은 화면에서는 탭 줄만 가로로 스크롤한다. */}
        <ScrollView
          accessibilityRole="tablist"
          className="mb-6 grow-0 border-b border-border"
          contentContainerClassName="flex-row items-center gap-6"
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <GraphDataSubTab
            active={params.tab === 'nodes'}
            count={<GraphNodeCount organizationId={organizationId} />}
            icon={Database}
            label="노드 관리 (Entities)"
            onPress={() => change({ tab: 'nodes' })}
          />
          <GraphDataSubTab
            active={params.tab === 'edges'}
            count={<GraphEdgeCount organizationId={organizationId} />}
            icon={GitCommit}
            label="관계 관리 (Edges)"
            onPress={() => change({ tab: 'edges' })}
          />
        </ScrollView>

        <GraphDataFilterBar
          key={params.tab}
          onChange={change}
          params={params}
        />

        <View className={cn(stale && 'opacity-60')}>
          <DashboardQueryBoundary
            errorFallbackClassName="py-12"
            fallback={
              <GraphTableSkeleton
                columns={
                  deferredParams.tab === 'nodes'
                    ? GRAPH_NODE_TABLE_COLUMNS
                    : GRAPH_EDGE_TABLE_COLUMNS
                }
              />
            }
            resetKeys={[deferredParams.tab]}
            title="표를 불러오지 못했습니다"
          >
            {deferredParams.tab === 'nodes' ? (
              <GraphNodeTable
                onCursorChange={(cursor) =>
                  onParamsChange({ ...params, cursor })
                }
                organizationId={organizationId}
                params={{
                  q: deferredParams.search || undefined,
                  kind:
                    deferredParams.kind === ALL_KINDS
                      ? undefined
                      : deferredParams.kind,
                  limit: deferredParams.pageSize,
                  cursor: deferredParams.cursor ?? undefined,
                }}
              />
            ) : (
              <GraphEdgeTable
                onCursorChange={(cursor) =>
                  onParamsChange({ ...params, cursor })
                }
                organizationId={organizationId}
                params={{
                  relation:
                    deferredParams.relation === ALL_KINDS
                      ? undefined
                      : deferredParams.relation,
                  limit: deferredParams.pageSize,
                  cursor: deferredParams.cursor ?? undefined,
                }}
              />
            )}
          </DashboardQueryBoundary>
        </View>
      </View>
    </ScrollView>
  );
}

function GraphDataSubTab({
  active,
  count,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  count: ReactNode;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      className={cn(
        '-mb-px flex-row items-center gap-2 border-b-2 pb-3',
        active ? 'border-foreground' : 'border-transparent',
      )}
      onPress={onPress}
    >
      <Icon
        as={icon}
        className={cn(
          'size-4',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      />
      <Text
        className={cn(
          'text-xs',
          active ? 'font-semibold' : 'font-medium text-muted-foreground',
        )}
      >
        {label}
      </Text>
      <Suspense fallback={<GraphTabCount value="–" />}>{count}</Suspense>
    </Pressable>
  );
}

function GraphTabCount({ value }: { value: number | string }) {
  return (
    <Badge className="ml-1 bg-muted" variant="outline">
      <Text className="font-mono text-[10px]">{value}</Text>
    </Badge>
  );
}

// 탭 배지는 필터와 무관한 전체 건수다. 표와 다른 작은 경계로 둬 표 로딩을 기다리지 않는다.
function GraphNodeCount({ organizationId }: { organizationId: string }) {
  const total = useKnowledgeGraphControllerListNodesSuspense(organizationId, {
    limit: 5,
  }).data.totalCount;
  return <GraphTabCount value={total ?? '?'} />;
}

function GraphEdgeCount({ organizationId }: { organizationId: string }) {
  const total = useKnowledgeGraphControllerListEdgesSuspense(organizationId, {
    limit: 5,
  }).data.totalCount;
  return <GraphTabCount value={total ?? '?'} />;
}
