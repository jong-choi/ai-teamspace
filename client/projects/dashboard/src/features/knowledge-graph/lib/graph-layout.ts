import type { GraphPoint } from '@core/features/knowledge-graph/state/graph-studio-store';

export const GRAPH_NODE_RADIUS = 22;
export const GRAPH_MIN_ZOOM = 0.4;
export const GRAPH_MAX_ZOOM = 2.5;

const RING_DISTANCE = 190;
const SPRING_LENGTH = 170;
const RELAX_ITERATIONS = 140;
const REPULSION = 22000;
const SPRING = 0.02;
const MAX_STEP = 24;
const REPULSION_CELL_SIZE = 260;
const REPULSION_CELL_RANGE = 2;
// 라벨까지 포함한 노드 bounds 여백이다.
const NODE_EXTENT = { left: 70, right: 70, top: 32, bottom: 60 };

export type GraphLayoutInput = {
  nodeIds: readonly string[];
  links: readonly { sourceId: string; targetId: string }[];
  focusId: string | null;
};

export type GraphPositions = Readonly<Record<string, GraphPoint>>;

export type GraphViewport = { x: number; y: number; scale: number };

export type GraphBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * 같은 입력에 항상 같은 좌표를 내는 bounded layout이다.
 * 이전 좌표가 있는 노드는 고정하고 새 노드만 이웃 근처에 놓은 뒤 정해진 횟수만 완화한다.
 */
export function layoutGraph(
  input: GraphLayoutInput,
  previous: GraphPositions = {},
): GraphPositions {
  const ids = [...new Set(input.nodeIds)].sort();
  if (ids.length === 0) return {};

  const known = new Set(ids);
  const neighbors = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const { sourceId, targetId } of input.links) {
    if (!known.has(sourceId) || !known.has(targetId) || sourceId === targetId)
      continue;
    neighbors.get(sourceId)?.push(targetId);
    neighbors.get(targetId)?.push(sourceId);
  }
  for (const list of neighbors.values()) list.sort();

  const positions = new Map<string, GraphPoint>();
  const fixed = new Set<string>();
  for (const id of ids) {
    const point = previous[id];
    if (point) {
      positions.set(id, point);
      fixed.add(id);
    }
  }

  if (fixed.size === 0) {
    seedRings(ids, neighbors, input.focusId, positions);
  } else {
    seedNearNeighbors(ids, neighbors, positions);
  }

  relax(ids, input.links, known, positions, fixed);

  return Object.fromEntries(
    ids.flatMap((id) => {
      const point = positions.get(id);
      return point ? [[id, round(point)]] : [];
    }),
  );
}

function seedRings(
  ids: readonly string[],
  neighbors: ReadonlyMap<string, readonly string[]>,
  focusId: string | null,
  positions: Map<string, GraphPoint>,
) {
  const byDegree = [...ids].sort(
    (a, b) =>
      (neighbors.get(b)?.length ?? 0) - (neighbors.get(a)?.length ?? 0) ||
      a.localeCompare(b),
  );
  const visited = new Set<string>();
  let componentOffset = 0;

  for (const start of focusId && ids.includes(focusId)
    ? [focusId, ...byDegree]
    : byDegree) {
    if (visited.has(start)) continue;
    const rings: string[][] = [[start]];
    visited.add(start);
    while (true) {
      const next: string[] = [];
      for (const id of rings[rings.length - 1]!) {
        for (const neighbor of neighbors.get(id) ?? []) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
      if (next.length === 0) break;
      rings.push(next);
    }

    const center = { x: componentOffset, y: 0 };
    rings.forEach((ring, depth) => {
      ring.forEach((id, index) => {
        if (depth === 0) {
          positions.set(id, center);
          return;
        }
        const angle = (index / ring.length) * Math.PI * 2 + depth * 0.6;
        positions.set(id, {
          x: center.x + Math.cos(angle) * RING_DISTANCE * depth,
          y: center.y + Math.sin(angle) * RING_DISTANCE * depth * 0.72,
        });
      });
    });
    componentOffset += RING_DISTANCE * (rings.length * 2 + 1);
  }
}

function seedNearNeighbors(
  ids: readonly string[],
  neighbors: ReadonlyMap<string, readonly string[]>,
  positions: Map<string, GraphPoint>,
) {
  const placed = [...positions.values()];
  const fallback = placed.reduce(
    (max, point) => ({ x: Math.max(max.x, point.x), y: max.y }),
    { x: 0, y: 0 },
  );
  ids
    .filter((id) => !positions.has(id))
    .forEach((id, index) => {
      const anchors = (neighbors.get(id) ?? [])
        .map((neighbor) => positions.get(neighbor))
        .filter((point): point is GraphPoint => Boolean(point));
      const base =
        anchors.length > 0
          ? {
              x:
                anchors.reduce((sum, point) => sum + point.x, 0) /
                anchors.length,
              y:
                anchors.reduce((sum, point) => sum + point.y, 0) /
                anchors.length,
            }
          : { x: fallback.x + RING_DISTANCE, y: fallback.y };
      const angle = (hash(id) % 360) * (Math.PI / 180) + index;
      positions.set(id, {
        x: base.x + Math.cos(angle) * SPRING_LENGTH,
        y: base.y + Math.sin(angle) * SPRING_LENGTH,
      });
    });
}

function relax(
  ids: readonly string[],
  links: GraphLayoutInput['links'],
  known: ReadonlySet<string>,
  positions: Map<string, GraphPoint>,
  fixed: ReadonlySet<string>,
) {
  const movable = ids.filter((id) => !fixed.has(id));
  if (movable.length === 0) return;

  for (let iteration = 0; iteration < RELAX_ITERATIONS; iteration += 1) {
    const cooling = 1 - iteration / RELAX_ITERATIONS;
    const forces = new Map(movable.map((id) => [id, { x: 0, y: 0 }]));
    const buckets = createPositionBuckets(ids, positions);

    for (const id of movable) {
      const point = positions.get(id);
      const force = forces.get(id);
      if (!point || !force) continue;
      for (const other of nearbyNodeIds(point, buckets)) {
        if (other === id) continue;
        const otherPoint = positions.get(other);
        if (!otherPoint) continue;
        let dx = point.x - otherPoint.x;
        let dy = point.y - otherPoint.y;
        if (dx === 0 && dy === 0) {
          // 같은 좌표에서는 ID 순서로 결정적인 방향을 준다.
          dx = id < other ? 1 : -1;
          dy = 0.5;
        }
        const distanceSquared = Math.max(dx * dx + dy * dy, 400);
        const distance = Math.sqrt(distanceSquared);
        force.x += (dx / distance) * (REPULSION / distanceSquared);
        force.y += (dy / distance) * (REPULSION / distanceSquared);
      }
    }

    for (const { sourceId, targetId } of links) {
      if (!known.has(sourceId) || !known.has(targetId) || sourceId === targetId)
        continue;
      const source = positions.get(sourceId);
      const target = positions.get(targetId);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const pull = (distance - SPRING_LENGTH) * SPRING;
      const fx = (dx / distance) * pull;
      const fy = (dy / distance) * pull;
      const sourceForce = forces.get(sourceId);
      if (sourceForce) {
        sourceForce.x += fx;
        sourceForce.y += fy;
      }
      const targetForce = forces.get(targetId);
      if (targetForce) {
        targetForce.x -= fx;
        targetForce.y -= fy;
      }
    }

    for (const id of movable) {
      const point = positions.get(id);
      const force = forces.get(id);
      if (!point || !force) continue;
      const step = Math.min(
        Math.sqrt(force.x * force.x + force.y * force.y),
        MAX_STEP * cooling,
      );
      const magnitude = Math.max(
        Math.sqrt(force.x * force.x + force.y * force.y),
        0.0001,
      );
      positions.set(id, {
        x: point.x + (force.x / magnitude) * step,
        y: point.y + (force.y / magnitude) * step,
      });
    }
  }
}

function createPositionBuckets(
  ids: readonly string[],
  positions: ReadonlyMap<string, GraphPoint>,
): ReadonlyMap<string, readonly string[]> {
  const buckets = new Map<string, string[]>();
  for (const id of ids) {
    const point = positions.get(id);
    if (!point) continue;
    const key = positionBucketKey(point);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(id);
    else buckets.set(key, [id]);
  }
  return buckets;
}

function nearbyNodeIds(
  point: GraphPoint,
  buckets: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const cellX = Math.floor(point.x / REPULSION_CELL_SIZE);
  const cellY = Math.floor(point.y / REPULSION_CELL_SIZE);
  const nearby: string[] = [];
  for (
    let xOffset = -REPULSION_CELL_RANGE;
    xOffset <= REPULSION_CELL_RANGE;
    xOffset += 1
  ) {
    for (
      let yOffset = -REPULSION_CELL_RANGE;
      yOffset <= REPULSION_CELL_RANGE;
      yOffset += 1
    ) {
      nearby.push(
        ...(buckets.get(`${cellX + xOffset}:${cellY + yOffset}`) ?? []),
      );
    }
  }
  return nearby;
}

function positionBucketKey(point: GraphPoint): string {
  return `${Math.floor(point.x / REPULSION_CELL_SIZE)}:${Math.floor(point.y / REPULSION_CELL_SIZE)}`;
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

function round(point: GraphPoint): GraphPoint {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function getGraphBounds(
  points: readonly GraphPoint[],
): GraphBounds | null {
  if (points.length === 0) return null;
  return points.reduce<GraphBounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x - NODE_EXTENT.left),
      minY: Math.min(bounds.minY, point.y - NODE_EXTENT.top),
      maxX: Math.max(bounds.maxX, point.x + NODE_EXTENT.right),
      maxY: Math.max(bounds.maxY, point.y + NODE_EXTENT.bottom),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(Math.max(scale, GRAPH_MIN_ZOOM), GRAPH_MAX_ZOOM);
}

/** 노드 bounds 전체가 보이도록 가운데 맞춘다. 빈 그래프나 0 크기에서는 reset과 같다. */
export function fitViewport(
  bounds: GraphBounds | null,
  size: { width: number; height: number },
  padding = 48,
): GraphViewport {
  if (!bounds || size.width <= 0 || size.height <= 0) {
    return resetViewport(size);
  }
  const contentWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const contentHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = clampZoom(
    Math.min(
      Math.max(size.width - padding * 2, 1) / contentWidth,
      Math.max(size.height - padding * 2, 1) / contentHeight,
      1,
    ),
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    x: size.width / 2 - centerX * scale,
    y: size.height / 2 - centerY * scale,
  };
}

/** 원점 100%로 되돌린다. 원점은 캔버스 가운데에 둔다. */
export function resetViewport(size: {
  width: number;
  height: number;
}): GraphViewport {
  return {
    scale: 1,
    x: Math.max(size.width, 0) / 2,
    y: Math.max(size.height, 0) / 2,
  };
}

/** focal point의 world 좌표를 유지하며 배율을 바꾼다. */
export function zoomViewportAt(
  viewport: GraphViewport,
  nextScale: number,
  focal: GraphPoint,
): GraphViewport {
  const scale = clampZoom(nextScale);
  const worldX = (focal.x - viewport.x) / viewport.scale;
  const worldY = (focal.y - viewport.y) / viewport.scale;
  return { scale, x: focal.x - worldX * scale, y: focal.y - worldY * scale };
}

export function toWorldPoint(
  viewport: GraphViewport,
  screen: GraphPoint,
): GraphPoint {
  return {
    x: (screen.x - viewport.x) / viewport.scale,
    y: (screen.y - viewport.y) / viewport.scale,
  };
}
