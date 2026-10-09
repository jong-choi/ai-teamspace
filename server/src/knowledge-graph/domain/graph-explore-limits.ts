export const GRAPH_EXPLORE_LIMITS = {
  defaultDepth: 1,
  maxDepth: 2,
  defaultNodes: 50,
  maxNodes: 100,
  maxEdges: 200,
  maxHopFrontier: 25,
  maxHopCandidates: 500,
  maxSemanticEntitiesPerDocument: 50,
  maxSemanticRelationsPerDocument: 100,
  maxResponseBytes: 256 * 1024,
} as const;

export function clampGraphExploreLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), GRAPH_EXPLORE_LIMITS.maxNodes);
}

export function clampGraphExploreDepth(depth: number): number {
  return Math.min(Math.max(depth, 1), GRAPH_EXPLORE_LIMITS.maxDepth);
}
