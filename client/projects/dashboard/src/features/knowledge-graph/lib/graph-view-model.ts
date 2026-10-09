import type { GraphEdge } from '@repo/client/api-client/generated/schemas/graphEdge.zod';
import type { GraphNode } from '@repo/client/api-client/generated/schemas/graphNode.zod';
import { GRAPH_NODE_RADIUS } from '@core/features/knowledge-graph/lib/graph-layout';
import type { GraphPoint } from '@core/features/knowledge-graph/state/graph-studio-store';

const PARALLEL_SPACING = 30;
const ARROW_LENGTH = 7;
const ARROW_HALF_WIDTH = 3.5;
const SELF_LOOP_RADIUS = 18;
const EDGE_HIT_DISTANCE = 8;
const NODE_HIT_SLOP = 6;

export type GraphEdgeGeometry = {
  path: string;
  arrow: string | null;
  label: GraphPoint;
  samples: readonly GraphPoint[];
};

/** 양끝 노드가 모두 있는 edge만 남긴다. 없는 endpoint의 ghost edge를 그리지 않는다. */
export function getRenderableEdges<
  TNode extends Pick<GraphNode, 'id'>,
  TEdge extends Pick<GraphEdge, 'sourceNodeId' | 'targetNodeId'>,
>(nodes: readonly TNode[], edges: readonly TEdge[]): TEdge[] {
  const ids = new Set(nodes.map(({ id }) => id));
  return edges.filter(
    ({ sourceNodeId, targetNodeId }) =>
      ids.has(sourceNodeId) && ids.has(targetNodeId),
  );
}

/**
 * 같은 노드 쌍의 parallel edge에 서로 다른 곡률 offset을 준다.
 * 방향과 무관하게 같은 쌍으로 묶어 선이 겹치지 않게 한다.
 */
export function getParallelOffsets(
  edges: readonly Pick<GraphEdge, 'id' | 'sourceNodeId' | 'targetNodeId'>[],
): ReadonlyMap<string, number> {
  const groups = new Map<string, string[]>();
  for (const edge of edges) {
    const key = [edge.sourceNodeId, edge.targetNodeId].sort().join('\u0000');
    groups.set(key, [...(groups.get(key) ?? []), edge.id]);
  }
  const offsets = new Map<string, number>();
  for (const ids of groups.values()) {
    const sorted = [...ids].sort();
    sorted.forEach((id, index) => {
      offsets.set(id, (index - (sorted.length - 1) / 2) * PARALLEL_SPACING);
    });
  }
  return offsets;
}

export function getEdgeGeometry(
  source: GraphPoint,
  target: GraphPoint,
  options: { directed: boolean; offset: number; selfLoop: boolean },
): GraphEdgeGeometry {
  if (options.selfLoop) {
    const centerY = source.y - GRAPH_NODE_RADIUS - SELF_LOOP_RADIUS + 6;
    const start = { x: source.x - 10, y: source.y - GRAPH_NODE_RADIUS + 2 };
    const end = { x: source.x + 10, y: source.y - GRAPH_NODE_RADIUS + 2 };
    const samples = Array.from({ length: 13 }, (_, index) => {
      const angle = Math.PI * 0.75 - (index / 12) * Math.PI * 1.5 - Math.PI / 2;
      return {
        x: source.x + Math.cos(angle) * SELF_LOOP_RADIUS,
        y: centerY + Math.sin(angle) * SELF_LOOP_RADIUS,
      };
    });
    return {
      path: `M ${start.x} ${start.y} A ${SELF_LOOP_RADIUS} ${SELF_LOOP_RADIUS} 0 1 1 ${end.x} ${end.y}`,
      arrow: options.directed
        ? arrowPath(end, { x: end.x - 4, y: end.y - 8 })
        : null,
      label: { x: source.x, y: centerY - SELF_LOOP_RADIUS - 6 },
      samples,
    };
  }

  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const normal = { x: -dy / length, y: dx / length };
  const control = {
    x: (source.x + target.x) / 2 + normal.x * options.offset * 2,
    y: (source.y + target.y) / 2 + normal.y * options.offset * 2,
  };
  // 노드 원 경계에서 끝나게 해 화살표가 원 안에 숨지 않게 한다.
  const end = pointToward(target, control, GRAPH_NODE_RADIUS + 3);
  const start = pointToward(source, control, GRAPH_NODE_RADIUS);
  const samples = Array.from({ length: 13 }, (_, index) =>
    quadraticPoint(start, control, end, index / 12),
  );
  const middle = quadraticPoint(start, control, end, 0.5);

  return {
    path:
      options.offset === 0
        ? `M ${start.x} ${start.y} L ${end.x} ${end.y}`
        : `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    arrow: options.directed
      ? arrowPath(end, options.offset === 0 ? start : control)
      : null,
    label: { x: middle.x, y: middle.y - 6 },
    samples,
  };
}

function pointToward(from: GraphPoint, toward: GraphPoint, distance: number) {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  return {
    x: from.x + (dx / length) * distance,
    y: from.y + (dy / length) * distance,
  };
}

function quadraticPoint(
  start: GraphPoint,
  control: GraphPoint,
  end: GraphPoint,
  t: number,
): GraphPoint {
  const inverse = 1 - t;
  return {
    x:
      inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y:
      inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  };
}

function arrowPath(tip: GraphPoint, from: GraphPoint): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const unit = { x: dx / length, y: dy / length };
  const base = {
    x: tip.x - unit.x * ARROW_LENGTH,
    y: tip.y - unit.y * ARROW_LENGTH,
  };
  const left = {
    x: base.x - unit.y * ARROW_HALF_WIDTH,
    y: base.y + unit.x * ARROW_HALF_WIDTH,
  };
  const right = {
    x: base.x + unit.y * ARROW_HALF_WIDTH,
    y: base.y - unit.x * ARROW_HALF_WIDTH,
  };
  return `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`;
}

export function hitTestNode(
  positions: ReadonlyMap<string, GraphPoint>,
  world: GraphPoint,
): string | null {
  let hit: { id: string; distance: number } | null = null;
  for (const [id, point] of positions) {
    const distance = Math.hypot(point.x - world.x, point.y - world.y);
    if (
      distance <= GRAPH_NODE_RADIUS + NODE_HIT_SLOP &&
      (!hit || distance < hit.distance)
    ) {
      hit = { id, distance };
    }
  }
  return hit?.id ?? null;
}

/** 얇은 선은 그대로 두고 hit 판정만 넓힌다. 배율이 작아져도 화면 기준 거리를 유지한다. */
export function hitTestEdge(
  geometries: ReadonlyMap<string, GraphEdgeGeometry>,
  world: GraphPoint,
  scale: number,
): string | null {
  const threshold = EDGE_HIT_DISTANCE / Math.max(scale, 0.01);
  let hit: { id: string; distance: number } | null = null;
  for (const [id, geometry] of geometries) {
    const distance = Math.min(
      Math.hypot(geometry.label.x - world.x, geometry.label.y - world.y),
      ...geometry.samples
        .slice(1)
        .map((point, index) =>
          distanceToSegment(world, geometry.samples[index]!, point),
        ),
    );
    if (distance <= threshold && (!hit || distance < hit.distance)) {
      hit = { id, distance };
    }
  }
  return hit?.id ?? null;
}

function distanceToSegment(
  point: GraphPoint,
  start: GraphPoint,
  end: GraphPoint,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - start.x) * dx + (point.y - start.y) * dy) /
              lengthSquared,
          ),
        );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export type GraphNodeConnection<TEdge> = {
  edge: TEdge;
  direction: 'outgoing' | 'incoming' | 'undirected' | 'self';
  otherNodeId: string;
};

export function getNodeConnections<
  TEdge extends Pick<
    GraphEdge,
    'id' | 'sourceNodeId' | 'targetNodeId' | 'directed'
  >,
>(nodeId: string, edges: readonly TEdge[]): GraphNodeConnection<TEdge>[] {
  return edges.flatMap((edge): GraphNodeConnection<TEdge>[] => {
    if (edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId) return [];
    if (edge.sourceNodeId === edge.targetNodeId) {
      return [{ edge, direction: 'self', otherNodeId: nodeId }];
    }
    const outgoing = edge.sourceNodeId === nodeId;
    return [
      {
        edge,
        direction: !edge.directed
          ? 'undirected'
          : outgoing
            ? 'outgoing'
            : 'incoming',
        otherNodeId: outgoing ? edge.targetNodeId : edge.sourceNodeId,
      },
    ];
  });
}
