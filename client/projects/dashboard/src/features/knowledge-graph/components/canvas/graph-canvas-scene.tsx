import { Platform } from 'react-native';
import { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import type { GraphEdge } from '@repo/client/api-client/generated/schemas/graphEdge.zod';
import type { GraphNode } from '@repo/client/api-client/generated/schemas/graphNode.zod';
import type { GraphThemePalette } from '@core/features/knowledge-graph/hooks/use-graph-theme-palette';
import { GRAPH_NODE_RADIUS } from '@core/features/knowledge-graph/lib/graph-layout';
import {
  formatPredicate,
  GRAPH_FACT_CLASS_META,
  GRAPH_NODE_KIND_META,
  truncateGraphLabel,
} from '@core/features/knowledge-graph/lib/graph-presentation';
import type { GraphEdgeGeometry } from '@core/features/knowledge-graph/lib/graph-view-model';
import type {
  GraphPoint,
  GraphSelection,
} from '@core/features/knowledge-graph/state/graph-studio-store';

const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, Menlo, monospace',
});

type GraphCanvasSceneProps = {
  edges: readonly GraphEdge[];
  focusNodeId: string | null;
  geometries: ReadonlyMap<string, GraphEdgeGeometry>;
  nodes: readonly GraphNode[];
  palette: GraphThemePalette;
  positions: ReadonlyMap<string, GraphPoint>;
  selection: GraphSelection | null;
};

/** edge layer → node layer → 선택 강조 순서로 그린다. */
export function GraphCanvasScene({
  edges,
  focusNodeId,
  geometries,
  nodes,
  palette,
  positions,
  selection,
}: GraphCanvasSceneProps) {
  const selectedNodeId = selection?.kind === 'node' ? selection.id : null;
  const selectedEdgeId = selection?.kind === 'edge' ? selection.id : null;

  return (
    <>
      <G>
        {edges.map((edge) => {
          const geometry = geometries.get(edge.id);
          if (!geometry) return null;
          const active =
            edge.id === selectedEdgeId ||
            (selectedNodeId !== null &&
              (edge.sourceNodeId === selectedNodeId ||
                edge.targetNodeId === selectedNodeId));
          return (
            <GraphEdgeGlyph
              active={active}
              edge={edge}
              geometry={geometry}
              key={edge.id}
              palette={palette}
              selected={edge.id === selectedEdgeId}
            />
          );
        })}
      </G>
      <G>
        {nodes.map((node) => {
          const point = positions.get(node.id);
          if (!point) return null;
          return (
            <GraphNodeGlyph
              focus={node.id === focusNodeId}
              key={node.id}
              node={node}
              palette={palette}
              point={point}
              selected={node.id === selectedNodeId}
            />
          );
        })}
      </G>
    </>
  );
}

function GraphEdgeGlyph({
  active,
  edge,
  geometry,
  palette,
  selected,
}: {
  active: boolean;
  edge: GraphEdge;
  geometry: GraphEdgeGeometry;
  palette: GraphThemePalette;
  selected: boolean;
}) {
  const stroke = active ? palette.active : palette.edge;
  return (
    <G>
      <Path
        d={geometry.path}
        fill="none"
        stroke={stroke}
        strokeDasharray={GRAPH_FACT_CLASS_META[edge.factClass].dash}
        strokeWidth={selected ? 2.5 : active ? 2 : 1.5}
      />
      {geometry.arrow ? (
        <Path
          d={geometry.arrow}
          fill={active ? palette.active : palette.edgeLabel}
        />
      ) : null}
      <SvgText
        fill={active ? palette.active : palette.edgeLabel}
        fontFamily={MONO_FONT}
        fontSize={10}
        fontWeight="600"
        textAnchor="middle"
        x={geometry.label.x}
        y={geometry.label.y}
      >
        {formatPredicate(edge.predicate ?? edge.relation)}
      </SvgText>
    </G>
  );
}

function GraphNodeGlyph({
  focus,
  node,
  palette,
  point,
  selected,
}: {
  focus: boolean;
  node: GraphNode;
  palette: GraphThemePalette;
  point: GraphPoint;
  selected: boolean;
}) {
  // graph.html의 카테고리별 회색 단계를 출처 단계로 옮기고 선 패턴을 함께 쓴다.
  const stroke =
    node.factClass === 'authoritative'
      ? palette.nodeStroke
      : node.factClass === 'user_curated'
        ? palette.nodeStrokeMuted
        : palette.nodeStrokeSubtle;

  return (
    <G transform={`translate(${point.x}, ${point.y})`}>
      {selected || focus ? (
        <Circle
          fill="none"
          r={GRAPH_NODE_RADIUS + 6}
          stroke={palette.active}
          strokeDasharray={selected ? undefined : '2 3'}
          strokeOpacity={selected ? 0.55 : 0.4}
          strokeWidth={selected ? 3 : 1.5}
        />
      ) : null}
      <Circle
        fill={palette.nodeFill}
        r={GRAPH_NODE_RADIUS}
        stroke={selected ? palette.active : stroke}
        strokeDasharray={GRAPH_FACT_CLASS_META[node.factClass].dash}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <Circle fill={selected ? palette.active : stroke} r={5} />
      <SvgText
        fill={palette.label}
        fontSize={11}
        fontWeight="600"
        textAnchor="middle"
        y={38}
      >
        {truncateGraphLabel(node.title)}
      </SvgText>
      <SvgText
        fill={palette.subLabel}
        fontFamily={MONO_FONT}
        fontSize={9}
        textAnchor="middle"
        y={50}
      >
        {GRAPH_NODE_KIND_META[node.kind].code}
      </SvgText>
    </G>
  );
}
