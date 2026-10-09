import { Injectable } from '@nestjs/common';

import type { GraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import { GRAPH_EXPLORE_LIMITS } from '@/knowledge-graph/domain/graph-explore-limits';
import type {
  ExploreQuery,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import {
  decodeExploreAfter,
  encodeExploreNext,
} from '@/knowledge-graph/graph-read-pagination';
import {
  graphEdgeRelationRank,
  graphNodeKindRank,
} from '@/knowledge-graph/graph-read-support';

type Reach = {
  node: GraphNode;
  hop: 0 | 1 | 2;
  relation: GraphEdge['relation'];
};

export type ExploreResultInput = {
  organizationId: string;
  query: ExploreQuery;
  depth: number;
  seeds: readonly GraphNode[];
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  sourceTruncated: boolean;
  projectionPending: boolean;
  completeness: GraphCompleteness;
};

@Injectable()
export class GraphExploreResultService {
  build(input: ExploreResultInput): GraphSnapshot {
    const reachable = this.reachable(
      input.seeds,
      input.nodes,
      input.edges,
      input.depth,
    );
    const decodedAfter = decodeExploreAfter(
      input.organizationId,
      input.query,
    );
    const after = decodedAfter
      ? { ...decodedAfter, hop: decodedAfter.hop as 1 | 2 }
      : null;
    const ordered = reachable
      .filter((row) => row.hop > 0)
      .sort((left, right) => this.compareReach(left, right))
      .filter((row) => !after || this.afterCursor(row, after));

    const maxNodes = Math.min(
      input.query.limit,
      GRAPH_EXPLORE_LIMITS.maxNodes,
    );
    const fixedSeeds = input.seeds.slice(0, maxNodes);
    const selectedNeighbors = ordered.slice(
      0,
      Math.max(0, maxNodes - fixedSeeds.length),
    );
    const selected = [
      ...fixedSeeds,
      ...selectedNeighbors.map((row) => row.node),
    ];
    const selectedIds = new Set(selected.map((node) => node.id));
    const candidateEdges = input.edges
      .filter(
        (edge) =>
          selectedIds.has(edge.sourceNodeId) &&
          selectedIds.has(edge.targetNodeId),
      )
      .slice(0, GRAPH_EXPLORE_LIMITS.maxEdges);

    const bounded = this.enforceBytes(selected, candidateEdges);
    const truncated =
      input.sourceTruncated ||
      ordered.length > selectedNeighbors.length ||
      input.edges.length > GRAPH_EXPLORE_LIMITS.maxEdges ||
      bounded.truncated;
    const lastReach = [...selectedNeighbors]
      .reverse()
      .find((row) =>
        bounded.nodes.some((node) => node.id === row.node.id),
      );

    return {
      nodes: bounded.nodes,
      edges: bounded.edges,
      truncated,
      nextCursor:
        truncated && lastReach
          ? encodeExploreNext(input.organizationId, input.query, {
              hop: lastReach.hop as 1 | 2,
              relation: lastReach.relation,
              nodeKind: lastReach.node.kind,
              nodeId: lastReach.node.id,
            })
          : null,
      completeness: input.completeness,
      degradedReasons: [
        ...(input.projectionPending
          ? (['projection_pending'] as const)
          : []),
        ...(input.completeness === 'complete'
          ? []
          : (['partial_rebuild'] as const)),
      ],
    };
  }

  empty(completeness: GraphCompleteness): GraphSnapshot {
    return {
      nodes: [],
      edges: [],
      truncated: false,
      nextCursor: null,
      completeness,
      degradedReasons: [],
    };
  }

  private reachable(
    seeds: readonly GraphNode[],
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
    depth: number,
  ) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const reach = new Map<string, Reach>();
    let frontier = seeds.map((seed) => seed.id);
    seeds.forEach((seed) =>
      reach.set(seed.id, {
        node: seed,
        hop: 0,
        relation: 'wiki_parent',
      }),
    );
    for (
      let hop = 1 as 1 | 2;
      hop <= depth;
      hop = (hop + 1) as 1 | 2
    ) {
      const next: string[] = [];
      const frontierSet = new Set(frontier);
      for (const edge of edges) {
        for (const [from, to] of [
          [edge.sourceNodeId, edge.targetNodeId],
          [edge.targetNodeId, edge.sourceNodeId],
        ] as const) {
          if (!frontierSet.has(from) || reach.has(to)) continue;
          const node = nodeById.get(to);
          if (!node) continue;
          reach.set(to, { node, hop, relation: edge.relation });
          next.push(to);
        }
      }
      frontier = [...new Set(next)];
      if (!frontier.length) break;
    }
    return [...reach.values()];
  }

  private compareReach(left: Reach, right: Reach) {
    return (
      left.hop - right.hop ||
      graphEdgeRelationRank(left.relation) -
        graphEdgeRelationRank(right.relation) ||
      graphNodeKindRank(left.node.kind) -
        graphNodeKindRank(right.node.kind) ||
      left.node.id.localeCompare(right.node.id)
    );
  }

  private afterCursor(
    row: Reach,
    after: {
      hop: 1 | 2;
      relation: GraphEdge['relation'];
      nodeKind: GraphNode['kind'];
      nodeId: string;
    },
  ) {
    return (
      row.hop > after.hop ||
      (row.hop === after.hop &&
        (graphEdgeRelationRank(row.relation) >
          graphEdgeRelationRank(after.relation) ||
          (row.relation === after.relation &&
            (graphNodeKindRank(row.node.kind) >
              graphNodeKindRank(after.nodeKind) ||
              (row.node.kind === after.nodeKind &&
                row.node.id > after.nodeId)))))
    );
  }

  private enforceBytes(nodes: GraphNode[], edges: GraphEdge[]) {
    const kept = [...nodes];
    let keptEdges = [...edges];
    let truncated = false;
    while (
      Buffer.byteLength(
        JSON.stringify({ nodes: kept, edges: keptEdges }),
      ) > GRAPH_EXPLORE_LIMITS.maxResponseBytes &&
      kept.length > 1
    ) {
      const removed = kept.pop()!;
      keptEdges = keptEdges.filter(
        (edge) =>
          edge.sourceNodeId !== removed.id &&
          edge.targetNodeId !== removed.id,
      );
      truncated = true;
    }
    return { nodes: kept, edges: keptEdges, truncated };
  }
}
