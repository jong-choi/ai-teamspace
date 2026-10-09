import {
  decodeGraphCursor,
  encodeGraphCursor,
  graphCursorFilterDigest,
} from '@/knowledge-graph/domain/graph-cursor';
import type {
  ExploreQuery,
  GraphEdge,
  GraphEdgeListQuery,
  GraphNode,
  GraphNodeListQuery,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import { decodeCursorOrScopeMismatch } from '@/knowledge-graph/graph-read-support';

export function nodeFilterDigest(
  organizationId: string,
  query: GraphNodeListQuery,
) {
  return graphCursorFilterDigest({
    organizationId,
    kind: query.kind ?? null,
    q: query.q ?? null,
    sort: 'kind-title-id',
  });
}

export function exploreFilterDigest(
  organizationId: string,
  query: ExploreQuery,
) {
  return graphCursorFilterDigest({
    organizationId,
    focusKind: query.focusKind ?? null,
    focusId: query.focusId ?? null,
    q: query.q ?? null,
    depth: query.q ? 1 : query.depth,
    sort: 'hop-relation-kind-node',
  });
}

export function decodeExploreAfter(
  organizationId: string,
  query: ExploreQuery,
) {
  if (!query.cursor) return null;
  const filterDigest = exploreFilterDigest(organizationId, query);
  const cursor = decodeCursorOrScopeMismatch(() =>
    decodeGraphCursor(query.cursor!, { endpoint: 'explore', filterDigest }),
  );
  return cursor.endpoint === 'explore' ? cursor.after : null;
}

export function encodeExploreNext(
  organizationId: string,
  query: ExploreQuery,
  after: {
    hop: 1 | 2;
    relation: GraphEdge['relation'];
    nodeKind: GraphNode['kind'];
    nodeId: string;
  },
) {
  return encodeGraphCursor({
    v: 1,
    endpoint: 'explore',
    filterDigest: exploreFilterDigest(organizationId, query),
    after,
  });
}

export function edgeFilterDigest(
  organizationId: string,
  query: GraphEdgeListQuery,
) {
  return graphCursorFilterDigest({
    organizationId,
    relation: query.relation ?? null,
    sort: 'relation-id',
  });
}

export function decodeNodeAfter(
  organizationId: string,
  query: GraphNodeListQuery,
) {
  if (!query.cursor) return null;
  const filterDigest = nodeFilterDigest(organizationId, query);
  const cursor = decodeCursorOrScopeMismatch(() =>
    decodeGraphCursor(query.cursor!, { endpoint: 'nodes', filterDigest }),
  );
  return cursor.endpoint === 'nodes' ? cursor.after : null;
}

export function decodeEdgeAfter(
  organizationId: string,
  query: GraphEdgeListQuery,
) {
  if (!query.cursor) return null;
  const filterDigest = edgeFilterDigest(organizationId, query);
  const cursor = decodeCursorOrScopeMismatch(() =>
    decodeGraphCursor(query.cursor!, { endpoint: 'edges', filterDigest }),
  );
  return cursor.endpoint === 'edges' ? cursor.after : null;
}

export function encodeNodeNext(
  organizationId: string,
  query: GraphNodeListQuery,
  node: GraphNode,
) {
  return encodeGraphCursor({
    v: 1,
    endpoint: 'nodes',
    filterDigest: nodeFilterDigest(organizationId, query),
    after: { kind: node.kind, title: node.title, id: node.id },
  });
}

export function encodeEdgeNext(
  organizationId: string,
  query: GraphEdgeListQuery,
  edge: GraphEdge,
) {
  return encodeGraphCursor({
    v: 1,
    endpoint: 'edges',
    filterDigest: edgeFilterDigest(organizationId, query),
    after: { relation: edge.relation, id: edge.id },
  });
}

export function compareNodeTuple(
  left: Pick<GraphNode, 'kind' | 'title' | 'id'>,
  right: Pick<GraphNode, 'kind' | 'title' | 'id'>,
  rank: (kind: GraphNode['kind']) => number,
) {
  return (
    rank(left.kind) - rank(right.kind) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

export function compareEdgeTuple(
  left: Pick<GraphEdge, 'relation' | 'id'>,
  right: Pick<GraphEdge, 'relation' | 'id'>,
  rank: (relation: GraphEdge['relation']) => number,
) {
  return (
    rank(left.relation) - rank(right.relation) ||
    left.id.localeCompare(right.id)
  );
}
