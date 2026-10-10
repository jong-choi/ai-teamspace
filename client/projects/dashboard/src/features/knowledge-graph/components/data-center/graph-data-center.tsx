import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  getKnowledgeGraphControllerListEdgesSuspenseQueryOptions,
  getKnowledgeGraphControllerListNodesSuspenseQueryOptions,
} from '@repo/client/api-client';
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

import { useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const clearSelection = useGraphStudioStore((state) => state.clearSelection);
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  const nodeParams = {
    q: params.search || undefined,
    kind: params.kind === ALL_KINDS ? undefined : params.kind,
    limit: params.pageSize,
  };
  const edgeParams = {
    relation: params.relation === ALL_KINDS ? undefined : params.relation,
    limit: params.pageSize,
  };

  // 어느 탭을 먼저 열어도 첫 페이지는 캐시에서 바로 시작하도록 함께 준비한다.
  useEffect(() => {
    void Promise.all([
      queryClient.prefetchQuery(
        getKnowledgeGraphControllerListNodesSuspenseQueryOptions(
          organizationId,
          nodeParams,
        ),
      ),
      queryClient.prefetchQuery(
        getKnowledgeGraphControllerListEdgesSuspenseQueryOptions(
          organizationId,
          edgeParams,
        ),
      ),
    ]);
  }, [
    edgeParams.limit,
    edgeParams.relation,
    nodeParams.kind,
    nodeParams.limit,
    nodeParams.q,
    organizationId,
    queryClient,
  ]);

  // 검색·필터·page size가 바뀌면 cursor를 처음으로 되돌린다.
  const change = (patch: Partial<GraphDataCenterParams>) =>
    onParamsChange({ ...params, cursor: null, ...patch });
  const switchTab = (tab: GraphDataCenterParams['tab']) => {
    if (tab === params.tab) return;
    clearSelection();
    change({ tab });
  };

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
            icon={Database}
            label="노드 관리 (Entities)"
            onPress={() => switchTab('nodes')}
          />
          <GraphDataSubTab
            active={params.tab === 'edges'}
            icon={GitCommit}
            label="관계 관리 (Edges)"
            onPress={() => switchTab('edges')}
          />
        </ScrollView>

        <GraphDataFilterBar
          key={params.tab}
          onChange={change}
          params={params}
        />

        <View key={`${organizationId}:${params.tab}`}>
          <DashboardQueryBoundary
            errorFallbackClassName="py-12"
            fallback={
              <GraphTableSkeleton
                columns={
                  params.tab === 'nodes'
                    ? GRAPH_NODE_TABLE_COLUMNS
                    : GRAPH_EDGE_TABLE_COLUMNS
                }
                rowCount={params.pageSize}
              />
            }
            resetKeys={[organizationId, params.tab]}
            title="표를 불러오지 못했습니다"
          >
            {params.tab === 'nodes' ? (
              <GraphNodeTable
                onCursorChange={(cursor) =>
                  onParamsChange({ ...params, cursor })
                }
                organizationId={organizationId}
                params={{
                  ...nodeParams,
                  cursor: params.cursor ?? undefined,
                }}
              />
            ) : (
              <GraphEdgeTable
                onCursorChange={(cursor) =>
                  onParamsChange({ ...params, cursor })
                }
                organizationId={organizationId}
                params={{
                  ...edgeParams,
                  cursor: params.cursor ?? undefined,
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
  icon,
  label,
  onPress,
}: {
  active: boolean;
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
    </Pressable>
  );
}
