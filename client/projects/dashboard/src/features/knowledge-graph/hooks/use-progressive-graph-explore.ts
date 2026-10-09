import { useState } from 'react';

import { useKnowledgeGraphControllerExploreSuspense } from '@repo/client/api-client';
import type { GraphSnapshot } from '@repo/client/api-client/generated/schemas/graphSnapshot.zod';
import type { GraphExploreParams } from '@core/features/knowledge-graph/lib/graph-route-params';

export function useProgressiveGraphExplore(
  organizationId: string,
  params: GraphExploreParams,
) {
  const [request, setRequest] = useState<{
    cursor: string | undefined;
    depth: 1 | 2;
  }>({ cursor: undefined, depth: 1 });
  const page = useKnowledgeGraphControllerExploreSuspense(organizationId, {
    ...params,
    depth: request.depth,
    limit: 100,
    cursor: request.cursor,
  }).data;
  const scopeKey = `${params.focusKind ?? ''}:${params.focusId ?? ''}:${params.q ?? ''}:${request.depth}`;
  const [pages, setPages] = useState(() => ({
    source: page,
    scopeKey,
    snapshot: page,
  }));
  if (pages.source !== page) {
    setPages({
      source: page,
      scopeKey,
      snapshot:
        pages.scopeKey === scopeKey && request.cursor
          ? mergeGraphSnapshots(pages.snapshot, page)
          : page,
    });
  }

  return {
    explore: pages.snapshot,
    canExpand: Boolean(params.focusId) && request.depth === 1,
    canLoadMore: Boolean(pages.snapshot.nextCursor),
    expand: () => setRequest({ cursor: undefined, depth: 2 }),
    loadMore: () =>
      setRequest((current) => ({
        ...current,
        cursor: pages.snapshot.nextCursor ?? undefined,
      })),
  };
}

function mergeGraphSnapshots(
  current: GraphSnapshot,
  next: GraphSnapshot,
): GraphSnapshot {
  const nodes = new Map(current.nodes.map((node) => [node.id, node]));
  const edges = new Map(current.edges.map((edge) => [edge.id, edge]));
  for (const node of next.nodes) nodes.set(node.id, node);
  for (const edge of next.edges) edges.set(edge.id, edge);
  return {
    ...next,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}

export function graphStatusLabel(snapshot: GraphSnapshot) {
  if (snapshot.degradedReasons.length > 0)
    return `부분 결과 · ${snapshot.degradedReasons.join(', ')}`;
  return snapshot.completeness === 'complete' ? '전체 결과' : '부분 결과';
}
