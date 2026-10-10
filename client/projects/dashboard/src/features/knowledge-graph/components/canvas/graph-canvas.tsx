import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G } from 'react-native-svg';

import { Text } from '@repo/client/rnr/components/ui/text';
import { GraphCanvasAccessibleList } from '@core/features/knowledge-graph/components/canvas/graph-canvas-accessible-list';
import { GraphCanvasGrid } from '@core/features/knowledge-graph/components/canvas/graph-canvas-grid';
import {
  GraphCanvasQuickActions,
  GraphCanvasToolbar,
} from '@core/features/knowledge-graph/components/canvas/graph-canvas-overlays';
import {
  mergeGraphPositions,
  toGraphLayoutInput,
} from '@core/features/knowledge-graph/components/canvas/graph-canvas-position';
import { GraphCanvasScene } from '@core/features/knowledge-graph/components/canvas/graph-canvas-scene';
import { useGraphCanvasPointer } from '@core/features/knowledge-graph/hooks/use-graph-canvas-pointer';
import { useGraphThemePalette } from '@core/features/knowledge-graph/hooks/use-graph-theme-palette';
import {
  graphStatusLabel,
  useProgressiveGraphExplore,
} from '@core/features/knowledge-graph/hooks/use-progressive-graph-explore';
import {
  fitViewport,
  getGraphBounds,
  type GraphViewport,
  layoutGraph,
  resetViewport,
  toWorldPoint,
  zoomViewportAt,
} from '@core/features/knowledge-graph/lib/graph-layout';
import type { GraphExploreParams } from '@core/features/knowledge-graph/lib/graph-route-params';
import {
  getEdgeGeometry,
  getParallelOffsets,
  getRenderableEdges,
  hitTestEdge,
  hitTestNode,
} from '@core/features/knowledge-graph/lib/graph-view-model';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';
import type {
  GraphPoint,
  GraphSelection,
} from '@core/features/knowledge-graph/state/graph-studio-store';

const BUTTON_ZOOM_IN = 1.15;
const BUTTON_ZOOM_OUT = 0.85;
const WORLD_PADDING = 120;
const TIMING = { duration: 160, reduceMotion: ReduceMotion.System };

type PanSession =
  | {
      mode: 'node';
      nodeId: string;
      origin: GraphPoint;
      scale: number;
      last: GraphPoint | null;
    }
  | { mode: 'canvas'; origin: GraphViewport }
  | null;

export function GraphCanvas({
  exploreParams,
  organizationId,
}: {
  exploreParams: GraphExploreParams;
  organizationId: string;
}) {
  const { canExpand, canLoadMore, expand, explore, loadMore } =
    useProgressiveGraphExplore(organizationId, exploreParams);
  const focusNodeId = exploreParams.focusId ?? null;
  const palette = useGraphThemePalette();
  const selection = useGraphStudioStore((state) => state.selection);
  const select = useGraphStudioStore((state) => state.select);
  const clearSelection = useGraphStudioStore((state) => state.clearSelection);
  const openDialog = useGraphStudioStore((state) => state.openDialog);
  const pinnedPositions = useGraphStudioStore((state) => state.pinnedPositions);
  const pinNode = useGraphStudioStore((state) => state.pinNode);

  const [layout, setLayout] = useState(() => ({
    source: explore,
    positions: layoutGraph(toGraphLayoutInput(explore, focusNodeId)),
  }));
  if (layout.source !== explore) {
    setLayout({
      source: explore,
      positions: layoutGraph(
        toGraphLayoutInput(explore, focusNodeId),
        layout.positions,
      ),
    });
  }

  const [drag, setDrag] = useState<{
    nodeId: string;
    point: GraphPoint;
  } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoomPercent, setZoomPercent] = useState(100);
  const [pointerTarget, setPointerTarget] = useState<View | null>(null);
  const panSession = useRef<PanSession>(null);
  const pinchOrigin = useRef<GraphViewport | null>(null);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const positions = mergeGraphPositions(
    layout.positions,
    pinnedPositions,
    drag,
  );
  const edges = getRenderableEdges(explore.nodes, explore.edges);
  const offsets = getParallelOffsets(edges);
  const geometries = new Map<string, ReturnType<typeof getEdgeGeometry>>();
  for (const edge of edges) {
    const source = positions.get(edge.sourceNodeId);
    const target = positions.get(edge.targetNodeId);
    if (!source || !target) continue;
    geometries.set(
      edge.id,
      getEdgeGeometry(source, target, {
        directed: edge.directed,
        offset: offsets.get(edge.id) ?? 0,
        selfLoop: edge.sourceNodeId === edge.targetNodeId,
      }),
    );
  }
  useEffect(() => {
    if (!selection) return;
    const exists =
      selection.kind === 'node'
        ? explore.nodes.some(({ id }) => id === selection.id)
        : edges.some(({ id }) => id === selection.id);
    if (!exists) clearSelection();
  }, [clearSelection, edges, explore.nodes, selection]);
  const bounds = getGraphBounds([...positions.values()]);
  const world = {
    x: (bounds?.minX ?? 0) - WORLD_PADDING,
    y: (bounds?.minY ?? 0) - WORLD_PADDING,
    width: (bounds ? bounds.maxX - bounds.minX : 0) + WORLD_PADDING * 2,
    height: (bounds ? bounds.maxY - bounds.minY : 0) + WORLD_PADDING * 2,
  };

  const viewportStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const currentViewport = (): GraphViewport => ({
    x: translateX.value,
    y: translateY.value,
    scale: scale.value,
  });

  const applyViewport = (next: GraphViewport, animated = false) => {
    translateX.value = animated ? withTiming(next.x, TIMING) : next.x;
    translateY.value = animated ? withTiming(next.y, TIMING) : next.y;
    scale.value = animated ? withTiming(next.scale, TIMING) : next.scale;
    setZoomPercent(Math.round(next.scale * 100));
  };

  const zoomBy = (factor: number, focal?: GraphPoint) => {
    const viewport = currentViewport();
    applyViewport(
      zoomViewportAt(
        viewport,
        viewport.scale * factor,
        focal ?? { x: size.width / 2, y: size.height / 2 },
      ),
      !focal,
    );
  };
  const fit = () => applyViewport(fitViewport(bounds, size), true);
  const reset = () => applyViewport(resetViewport(size), true);

  useGraphCanvasPointer(pointerTarget, {
    onWheelZoom: zoomBy,
    onKeyCommand: (command) => {
      if (command === 'zoom-in') zoomBy(BUTTON_ZOOM_IN);
      if (command === 'zoom-out') zoomBy(BUTTON_ZOOM_OUT);
      if (command === 'fit') fit();
      if (command === 'reset') reset();
    },
  });

  const handleLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const next = {
      width: nativeEvent.layout.width,
      height: nativeEvent.layout.height,
    };
    // 처음 크기를 알게 된 순간에만 화면에 맞춘다. 이후 크기 변화는 사용자의 배율을 유지한다.
    if (size.width === 0 && next.width > 0) {
      applyViewport(fitViewport(bounds, next));
    }
    setSize(next);
  };

  const hitAt = (screen: GraphPoint): GraphSelection | null => {
    const viewport = currentViewport();
    const point = toWorldPoint(viewport, screen);
    const nodeId = hitTestNode(positions, point);
    if (nodeId) return { kind: 'node', id: nodeId };
    const edgeId = hitTestEdge(geometries, point, viewport.scale);
    return edgeId ? { kind: 'edge', id: edgeId } : null;
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .maxPointers(1)
    .minDistance(4)
    .onBegin((event) => {
      const viewport = currentViewport();
      const nodeId = hitTestNode(positions, toWorldPoint(viewport, event));
      const origin = nodeId ? positions.get(nodeId) : undefined;
      panSession.current =
        nodeId && origin
          ? { mode: 'node', nodeId, origin, scale: viewport.scale, last: null }
          : { mode: 'canvas', origin: viewport };
    })
    .onStart(() => {
      const session = panSession.current;
      if (session?.mode === 'node')
        select({ kind: 'node', id: session.nodeId });
    })
    .onUpdate((event) => {
      const session = panSession.current;
      if (!session) return;
      if (session.mode === 'node') {
        const point = {
          x: Math.round(session.origin.x + event.translationX / session.scale),
          y: Math.round(session.origin.y + event.translationY / session.scale),
        };
        session.last = point;
        setDrag({ nodeId: session.nodeId, point });
        return;
      }
      translateX.value = session.origin.x + event.translationX;
      translateY.value = session.origin.y + event.translationY;
    })
    .onFinalize(() => {
      const session = panSession.current;
      panSession.current = null;
      if (session?.mode !== 'node') return;
      if (session.last) pinNode(session.nodeId, session.last);
      setDrag(null);
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(6)
    .onEnd((event, success) => {
      if (!success) return;
      const hit = hitAt(event);
      if (hit) select(hit);
      else clearSelection();
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      pinchOrigin.current = currentViewport();
    })
    .onUpdate((event) => {
      const origin = pinchOrigin.current;
      if (!origin) return;
      const next = zoomViewportAt(origin, origin.scale * event.scale, {
        x: event.focalX,
        y: event.focalY,
      });
      translateX.value = next.x;
      translateY.value = next.y;
      scale.value = next.scale;
    })
    .onEnd(() => {
      pinchOrigin.current = null;
      setZoomPercent(Math.round(scale.value * 100));
    });

  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, tap));
  const focusMissing =
    Boolean(exploreParams.focusId) &&
    !explore.nodes.some(({ id }) => id === exploreParams.focusId);
  const selectedNode =
    selection?.kind === 'node'
      ? explore.nodes.find(({ id }) => id === selection.id)
      : undefined;
  const edgeSourceNodeId =
    selectedNode &&
    selectedNode.factClass !== 'extracted' &&
    selectedNode.kind !== 'member'
      ? selectedNode.id
      : null;

  return (
    <View
      accessibilityLabel={`지식 그래프 캔버스, 노드 ${explore.nodes.length}개, 관계 ${edges.length}개. 목록은 데이터 센터에서 볼 수 있습니다.`}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/30"
      onLayout={handleLayout}
      ref={setPointerTarget}
    >
      <GraphCanvasGrid color={palette.grid} />
      <GraphCanvasAccessibleList nodes={explore.nodes} />
      <GestureDetector gesture={gesture}>
        <View className="absolute inset-0" collapsable={false}>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: 1,
                height: 1,
                transformOrigin: 'left top',
              },
              viewportStyle,
            ]}
          >
            <Svg
              height={world.height}
              style={{ position: 'absolute', left: world.x, top: world.y }}
              width={world.width}
            >
              <G transform={`translate(${-world.x}, ${-world.y})`}>
                <GraphCanvasScene
                  edges={edges}
                  focusNodeId={focusNodeId}
                  geometries={geometries}
                  nodes={explore.nodes}
                  palette={palette}
                  positions={positions}
                  selection={selection}
                />
              </G>
            </Svg>
          </Animated.View>
        </View>
      </GestureDetector>

      {explore.nodes.length === 0 ? (
        <View
          className="absolute inset-0 items-center justify-center"
          pointerEvents="none"
        >
          <Text className="text-xs text-muted-foreground">
            아직 그래프에 노드가 없습니다.
          </Text>
        </View>
      ) : null}

      <GraphCanvasToolbar
        canExpand={canExpand}
        canLoadMore={canLoadMore}
        edgeCount={edges.length}
        nodeCount={explore.nodes.length}
        onExpand={expand}
        onFit={fit}
        onLoadMore={loadMore}
        onReset={reset}
        onZoomIn={() => zoomBy(BUTTON_ZOOM_IN)}
        onZoomOut={() => zoomBy(BUTTON_ZOOM_OUT)}
        zoomPercent={zoomPercent}
        statusLabel={graphStatusLabel(explore)}
      />

      {focusMissing ? (
        <View className="absolute right-4 top-20 z-20 max-w-xs rounded-xl border border-border bg-background/90 px-3 py-1.5 shadow-sm">
          <Text className="text-xs text-muted-foreground">
            이 원본은 아직 그래프에 반영되지 않아 전체 그래프를 표시합니다.
          </Text>
        </View>
      ) : null}

      <GraphCanvasQuickActions
        onAddEdge={() =>
          openDialog({
            type: 'edge-create',
            sourceNodeId: edgeSourceNodeId,
          })
        }
        onAddNode={() => openDialog({ type: 'node-create' })}
      />
    </View>
  );
}
