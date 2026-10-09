import type { GraphPositions } from '@core/features/knowledge-graph/lib/graph-layout';
import type { GraphPoint } from '@core/features/knowledge-graph/state/graph-studio-store';

export function mergeGraphPositions(
  layout: GraphPositions,
  pinned: GraphPositions,
  drag: { nodeId: string; point: GraphPoint } | null,
): ReadonlyMap<string, GraphPoint> {
  const positions = new Map(Object.entries(layout));
  for (const [nodeId, point] of Object.entries(pinned)) {
    if (positions.has(nodeId)) positions.set(nodeId, point);
  }
  if (drag && positions.has(drag.nodeId))
    positions.set(drag.nodeId, drag.point);
  return positions;
}

export function toGraphLayoutInput(
  explore: GraphSnapshot,
  focusNodeId: string | null,
) {
  return {
    nodeIds: explore.nodes.map(({ id }) => id),
    links: explore.edges.map(({ sourceNodeId, targetNodeId }) => ({
      sourceId: sourceNodeId,
      targetId: targetNodeId,
    })),
    focusId: focusNodeId,
  };
}
import type { GraphSnapshot } from '@repo/client/api-client/generated/schemas/graphSnapshot.zod';
