import { useWindowDimensions, View } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { GraphCanvas } from '@core/features/knowledge-graph/components/canvas/graph-canvas';
import { GraphCanvasGrid } from '@core/features/knowledge-graph/components/canvas/graph-canvas-grid';
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
import type { GraphFixtureExploreParams } from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
import { useGraphThemePalette } from '@core/features/knowledge-graph/hooks/use-graph-theme-palette';
import type { GraphDataCenterParams } from '@core/features/knowledge-graph/lib/graph-route-params';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

// dashboard sidebar(lg)와 320px inspector를 함께 둘 수 있는 폭이다.
const WIDE_LAYOUT_MIN_WIDTH = 1024;

export function GraphStudio({
  dataParams,
  exploreParams,
  onDataParamsChange,
  onViewChange,
  organizationId,
  view,
}: {
  dataParams: GraphDataCenterParams;
  exploreParams: GraphFixtureExploreParams;
  onDataParamsChange: (params: GraphDataCenterParams) => void;
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
        onViewChange={onViewChange}
        view={view}
      />

      {view === 'graph' ? (
        <View className="min-h-0 flex-1 flex-row">
          {/* 캔버스와 인스펙터는 서로 다른 query 경계라 선택을 바꿔도 캔버스가 다시 로딩되지 않는다. */}
          <DashboardQueryBoundary
            errorFallbackClassName="flex-1 bg-muted/30"
            fallback={<GraphCanvasLoading />}
            resetKeys={[exploreParams.focusKind, exploreParams.focusId]}
            title="그래프를 불러오지 못했습니다"
          >
            <GraphCanvas
              exploreParams={exploreParams}
              key={`${exploreParams.focusKind ?? ''}:${exploreParams.focusId ?? ''}`}
              organizationId={organizationId}
            />
          </DashboardQueryBoundary>
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
