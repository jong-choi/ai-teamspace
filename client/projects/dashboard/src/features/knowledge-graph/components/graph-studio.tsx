import { useWindowDimensions, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { GraphCanvas } from '@core/features/knowledge-graph/components/canvas/graph-canvas';
import { GraphCanvasGrid } from '@core/features/knowledge-graph/components/canvas/graph-canvas-grid';
import { GraphSearchSummary } from '@core/features/knowledge-graph/components/canvas/graph-search-summary';
import { GraphDataCenter } from '@core/features/knowledge-graph/components/data-center/graph-data-center';
import { GraphDialogCoordinator } from '@core/features/knowledge-graph/components/dialogs/graph-dialog-coordinator';
import {
  GraphStudioHeader,
  type GraphStudioView,
} from '@core/features/knowledge-graph/components/graph-studio-header';
import {
  GraphInspectorDialog,
  GraphInspectorPanel,
} from '@core/features/knowledge-graph/components/inspector/graph-inspector';
import { useGraphThemePalette } from '@core/features/knowledge-graph/hooks/use-graph-theme-palette';
import type {
  GraphDataCenterParams,
  GraphExploreParams,
} from '@core/features/knowledge-graph/lib/graph-route-params';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

// dashboard sidebar(lg)와 320px inspector를 함께 둘 수 있는 폭이다.
const WIDE_LAYOUT_MIN_WIDTH = 1024;

export function GraphStudio({
  dataParams,
  exploreParams,
  onDataParamsChange,
  onExploreSearch,
  onViewChange,
  organizationId,
  view,
}: {
  dataParams: GraphDataCenterParams;
  exploreParams: GraphExploreParams;
  onDataParamsChange: (params: GraphDataCenterParams) => void;
  onExploreSearch: (query: string) => void;
  onViewChange: (view: GraphStudioView) => void;
  organizationId: string;
  view: GraphStudioView;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const openDialog = useGraphStudioStore((state) => state.openDialog);

  return (
    <View className="min-h-0 flex-1 bg-background">
      <GraphStudioHeader
        compact={width < 768}
        onCreate={() => openDialog({ type: 'node-create' })}
        onSearch={onExploreSearch}
        onViewChange={onViewChange}
        searchValue={exploreParams.q ?? ''}
        view={view}
      />

      {view === 'graph' ? (
        <View className="min-h-0 flex-1 flex-row">
          {/* 캔버스와 인스펙터는 서로 다른 query 경계라 선택을 바꿔도 캔버스가 다시 로딩되지 않는다. */}
          <DashboardQueryBoundary
            errorFallbackClassName="flex-1 bg-muted/30"
            fallback={<GraphCanvasLoading />}
            resetKeys={[
              exploreParams.focusKind,
              exploreParams.focusId,
              exploreParams.q,
            ]}
            title="그래프를 불러오지 못했습니다"
          >
            {exploreParams.q ||
            (exploreParams.focusKind && exploreParams.focusId) ? (
              <GraphCanvas
                exploreParams={exploreParams}
                key={`${exploreParams.focusKind ?? ''}:${exploreParams.focusId ?? ''}:${exploreParams.q ?? ''}`}
                organizationId={organizationId}
              />
            ) : (
              <GraphCanvasStart onOpenData={() => onViewChange('data')} />
            )}
          </DashboardQueryBoundary>
          {exploreParams.q ? (
            <DashboardQueryBoundary
              errorFallbackClassName="absolute bottom-4 right-4 z-20 max-w-xs"
              fallback={null}
              resetKeys={[organizationId, exploreParams.q]}
              title="의미 검색 결과를 불러오지 못했습니다"
            >
              <GraphSearchSummary
                organizationId={organizationId}
                query={exploreParams.q}
              />
            </DashboardQueryBoundary>
          ) : null}
          {wide ? (
            <GraphInspectorPanel organizationId={organizationId} />
          ) : null}
        </View>
      ) : (
        <GraphDataCenter
          onParamsChange={onDataParamsChange}
          organizationId={organizationId}
          params={dataParams}
        />
      )}

      {view === 'data' || !wide ? (
        <GraphInspectorDialog organizationId={organizationId} />
      ) : null}
      <GraphDialogCoordinator organizationId={organizationId} />
    </View>
  );
}

function GraphCanvasStart({ onOpenData }: { onOpenData: () => void }) {
  const palette = useGraphThemePalette();
  return (
    <View className="relative min-h-0 flex-1 items-center justify-center bg-muted/30 px-6">
      <GraphCanvasGrid color={palette.grid} />
      <View className="max-w-sm items-center gap-3 rounded-xl border border-border bg-background/90 p-4 shadow-sm">
        <Text className="text-center text-sm font-semibold">
          탐색할 노드를 선택해 주세요
        </Text>
        <Text className="text-center text-xs leading-5 text-muted-foreground">
          데이터 센터에서 노드를 열거나 Wiki의 그래프 보기로 들어오면 해당
          노드의 1단계 관계를 표시합니다.
        </Text>
        <Button onPress={onOpenData} size="sm" variant="outline">
          <Text className="text-xs">데이터 센터 열기</Text>
        </Button>
      </View>
    </View>
  );
}

function GraphCanvasLoading() {
  const palette = useGraphThemePalette();
  return (
    <View
      accessibilityLabel="그래프를 불러오는 중"
      accessibilityRole="progressbar"
      className="relative min-h-0 flex-1 items-center justify-center bg-muted/30"
    >
      <GraphCanvasGrid color={palette.grid} />
      <Text className="text-xs text-muted-foreground">
        그래프를 불러오는 중...
      </Text>
    </View>
  );
}
