import {
  type ReactNode,
  Suspense,
  useDeferredValue,
  useRef,
  useState,
} from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Badge } from '@repo/client/rnr/components/ui/badge';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import {
  GRAPH_EDGE_TABLE_COLUMNS,
  GraphEdgeTable,
} from '@core/features/knowledge-graph/components/data-center/graph-edge-table';
import {
  GRAPH_NODE_TABLE_COLUMNS,
  GraphNodeTable,
} from '@core/features/knowledge-graph/components/data-center/graph-node-table';
import { GraphTableSkeleton } from '@core/features/knowledge-graph/components/data-center/graph-table';
import {
  GRAPH_FIXTURE_NODE_KINDS,
  GRAPH_FIXTURE_PAGE_SIZES,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
// TODO(graph-05-orval): graph-05 node/edge 목록 generated Suspense hook으로 직접 교체한다.
import {
  useGraphFixtureEdgesSuspense,
  useGraphFixtureNodesSuspense,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-queries';
import { GRAPH_NODE_KIND_META } from '@core/features/knowledge-graph/lib/graph-presentation';
import type { GraphDataCenterParams } from '@core/features/knowledge-graph/lib/graph-route-params';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import {
  Database,
  GitCommit,
  Link2,
  type LucideIcon,
  Plus,
  Search,
} from 'lucide-react-native';

const SEARCH_COMMIT_DELAY_MS = 300;
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
                  search: deferredParams.search,
                  kind: deferredParams.kind,
                  pageSize: deferredParams.pageSize,
                  cursor: deferredParams.cursor,
                }}
              />
            ) : (
              <GraphEdgeTable
                onCursorChange={(cursor) =>
                  onParamsChange({ ...params, cursor })
                }
                organizationId={organizationId}
                params={{
                  search: deferredParams.search,
                  pageSize: deferredParams.pageSize,
                  cursor: deferredParams.cursor,
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
const COUNT_PARAMS = { search: '', pageSize: 5, cursor: null } as const;

function GraphNodeCount({ organizationId }: { organizationId: string }) {
  const total = useGraphFixtureNodesSuspense(organizationId, {
    ...COUNT_PARAMS,
    kind: 'all',
  }).data.totalCount;
  return <GraphTabCount value={total} />;
}

function GraphEdgeCount({ organizationId }: { organizationId: string }) {
  const total = useGraphFixtureEdgesSuspense(organizationId, COUNT_PARAMS).data
    .totalCount;
  return <GraphTabCount value={total} />;
}

function GraphDataFilterBar({
  onChange,
  params,
}: {
  onChange: (patch: Partial<GraphDataCenterParams>) => void;
  params: GraphDataCenterParams;
}) {
  const [search, setSearch] = useState(params.search);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitSearch = (value: string) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (value.trim() !== params.search) onChange({ search: value.trim() });
  };

  return (
    <View className="mb-4 flex-row flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm shadow-black/5">
      <View className="min-w-[240px] flex-1 flex-row items-center gap-2">
        <View className="relative flex-1 justify-center">
          <Icon
            as={Search}
            className="absolute left-3 z-10 size-4 text-muted-foreground"
          />
          <Input
            accessibilityLabel="이름, ID 또는 키워드 검색"
            className="h-8 pl-9 text-xs sm:h-8 md:text-xs"
            onChangeText={(value) => {
              setSearch(value);
              if (commitTimer.current) clearTimeout(commitTimer.current);
              commitTimer.current = setTimeout(
                () => commitSearch(value),
                SEARCH_COMMIT_DELAY_MS,
              );
            }}
            onSubmitEditing={() => commitSearch(search)}
            placeholder="이름, ID 또는 키워드 검색..."
            returnKeyType="search"
            value={search}
          />
        </View>

        {params.tab === 'nodes' ? (
          <Select
            onValueChange={(option) =>
              onChange({
                kind:
                  GRAPH_FIXTURE_NODE_KINDS.find(
                    (candidate) => candidate === option?.value,
                  ) ?? ALL_KINDS,
              })
            }
            value={{
              value: params.kind,
              label:
                params.kind === ALL_KINDS
                  ? '전체 카테고리'
                  : kindOptionLabel(params.kind),
            }}
          >
            <SelectTrigger
              accessibilityLabel="카테고리 필터"
              className="sm:h-8"
              size="sm"
            >
              <SelectValue className="text-xs" placeholder="전체 카테고리" />
            </SelectTrigger>
            <SelectContent align="start" side="bottom">
              <SelectItem label="전체 카테고리" value={ALL_KINDS}>
                전체 카테고리
              </SelectItem>
              {GRAPH_FIXTURE_NODE_KINDS.map((kind) => (
                <SelectItem
                  key={kind}
                  label={kindOptionLabel(kind)}
                  value={kind}
                >
                  {kindOptionLabel(kind)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </View>

      <View className="flex-row items-center gap-2">
        <Text className="text-xs text-muted-foreground">페이지당 항목:</Text>
        <Select
          onValueChange={(option) => {
            const pageSize = GRAPH_FIXTURE_PAGE_SIZES.find(
              (candidate) => String(candidate) === option?.value,
            );
            if (pageSize) onChange({ pageSize });
          }}
          value={{
            value: String(params.pageSize),
            label: `${params.pageSize}개`,
          }}
        >
          <SelectTrigger
            accessibilityLabel="페이지당 항목 수"
            className="sm:h-8"
            size="sm"
          >
            <SelectValue className="text-xs" placeholder="10개" />
          </SelectTrigger>
          <SelectContent align="end" side="bottom">
            {GRAPH_FIXTURE_PAGE_SIZES.map((size) => (
              <SelectItem key={size} label={`${size}개`} value={String(size)}>
                {`${size}개`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </View>
    </View>
  );
}

function kindOptionLabel(kind: (typeof GRAPH_FIXTURE_NODE_KINDS)[number]) {
  const meta = GRAPH_NODE_KIND_META[kind];
  return `${meta.code} (${meta.label})`;
}
