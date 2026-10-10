import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useKnowledgeGraphControllerListNodesSuspense } from '@repo/client/api-client';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { GraphCanvas } from '@core/features/knowledge-graph/components/canvas/graph-canvas';
import { GraphCanvasGrid } from '@core/features/knowledge-graph/components/canvas/graph-canvas-grid';
import { GraphFloatingSearch } from '@core/features/knowledge-graph/components/canvas/graph-floating-search';
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

import { ArrowRight } from 'lucide-react-native';

// dashboard sidebar(lg)와 320px inspector를 함께 둘 수 있는 폭이다.
const WIDE_LAYOUT_MIN_WIDTH = 1024;
// 헤더의 검색창과 긴 버튼 글자를 다 보여 줄 수 있는 최소 너비다.
const FULL_HEADER_MIN_WIDTH = 860;

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
  // Agent 패널이 열리면 창이 넓어도 본문은 좁다. 그래서 본문이 실제로 받은 너비를 본다.
  const [contentWidth, setContentWidth] = useState<number | null>(null);

  return (
    <View
      className="min-h-0 flex-1 bg-background"
      onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)}
    >
      <GraphStudioHeader
        compact={(contentWidth ?? width) < FULL_HEADER_MIN_WIDTH}
        onCreate={() => openDialog({ type: 'node-create' })}
        onViewChange={onViewChange}
        view={view}
      />

      {view === 'graph' ? (
        <View className="min-h-0 flex-1 flex-row">
          <View className="relative min-w-0 flex-1">
            <GraphFloatingSearch
              onSearch={onExploreSearch}
              value={exploreParams.q ?? ''}
            />
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
              <GraphCanvasContent
                exploreParams={exploreParams}
                onOpenData={() => onViewChange('data')}
                organizationId={organizationId}
              />
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
          </View>
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

function GraphCanvasContent({
  exploreParams,
  onOpenData,
  organizationId,
}: {
  exploreParams: GraphExploreParams;
  onOpenData: () => void;
  organizationId: string;
}) {
  if (exploreParams.q || (exploreParams.focusKind && exploreParams.focusId)) {
    return (
      <GraphCanvas
        exploreParams={exploreParams}
        key={`${exploreParams.focusKind ?? ''}:${exploreParams.focusId ?? ''}:${exploreParams.q ?? ''}`}
        organizationId={organizationId}
      />
    );
  }
  return (
    <DefaultGraphCanvas
      onOpenData={onOpenData}
      organizationId={organizationId}
    />
  );
}

function DefaultGraphCanvas({
  onOpenData,
  organizationId,
}: {
  onOpenData: () => void;
  organizationId: string;
}) {
  const firstWiki = useKnowledgeGraphControllerListNodesSuspense(
    organizationId,
    { kind: 'wiki_document', limit: 1 },
  ).data.items[0];
  if (!firstWiki) return <GraphCanvasStart onOpenData={onOpenData} />;
  const defaultExploreParams: GraphExploreParams = {
    focusKind: firstWiki.kind,
    focusId: firstWiki.id,
  };
  return (
    <GraphCanvas
      exploreParams={defaultExploreParams}
      key={`default:${firstWiki.id}`}
      organizationId={organizationId}
    />
  );
}

// 기본으로 잡을 위키 노드도 없을 때만 데이터 테이블 진입을 안내한다.
function GraphCanvasStart({ onOpenData }: { onOpenData: () => void }) {
  const palette = useGraphThemePalette();
  return (
    <View className="relative min-h-0 flex-1 items-center justify-center gap-3 bg-muted/30 px-6">
      <GraphCanvasGrid color={palette.grid} />
      <Text className="text-center text-xs leading-5 text-muted-foreground">
        노드를 검색하거나 데이터 테이블에서 노드를 열면 그래프가 그려집니다.
      </Text>
      <Button onPress={onOpenData} size="sm" variant="outline">
        <Text className="text-xs">데이터 테이블로 보기</Text>
        <Icon as={ArrowRight} className="size-3.5" />
      </Button>
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
