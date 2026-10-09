import { Injectable } from '@nestjs/common';

import type { GraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import { GRAPH_EXPLORE_LIMITS } from '@/knowledge-graph/domain/graph-explore-limits';
import type { GraphEdge, GraphNode } from '@/knowledge-graph/dto/graph-snapshot.dto';
import { GraphReadAssemblerService } from '@/knowledge-graph/graph-read-assembler.service';
import {
  decodeNodeIdOrNotFound,
  privateNodeKey,
} from '@/knowledge-graph/graph-read-support';
import { GraphSemanticReadService } from '@/knowledge-graph/graph-semantic-read.service';
import { KnowledgeGraphStructureReader } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.provider';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

export type ExploreTraversalResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  projectionPending: boolean;
};

@Injectable()
export class GraphExploreTraversalService {
  constructor(
    private readonly assembler: GraphReadAssemblerService,
    private readonly structure: KnowledgeGraphStructureReader,
    private readonly curated: CuratedGraphQueryRepository,
    private readonly semantic: GraphSemanticReadService,
  ) {}

  async traverseSeed(
    actor: OrganizationActorContext,
    organizationId: string,
    seed: GraphNode,
    depth: number,
    completeness: GraphCompleteness,
  ): Promise<ExploreTraversalResult> {
    const [structure, curated, semantic] = await Promise.all([
      this.structureForSeed(
        actor,
        organizationId,
        seed,
        depth,
        completeness,
      ),
      this.curatedForSeed(
        actor,
        organizationId,
        seed,
        depth,
        completeness,
      ),
      this.semanticForSeed(organizationId, seed, completeness),
    ]);
    return {
      nodes: this.uniqueNodes([
        ...structure.nodes,
        ...curated.nodes,
        ...semantic.nodes,
      ]),
      edges: this.uniqueEdges([
        ...structure.edges,
        ...curated.edges,
        ...semantic.edges,
      ]),
      truncated:
        structure.truncated || curated.truncated || semantic.truncated,
      projectionPending:
        structure.projectionPending ||
        [...curated.nodes, ...curated.edges].some(
          (item) => item.projectionState?.status !== 'applied',
        ),
    };
  }

  private async structureForSeed(
    actor: OrganizationActorContext,
    organizationId: string,
    seed: GraphNode,
    depth: number,
    completeness: GraphCompleteness,
  ) {
    const identity = decodeNodeIdOrNotFound(seed.id);
    if (identity[1] === 'e') {
      return {
        nodes: [] as GraphNode[],
        edges: [] as GraphEdge[],
        truncated: false,
        projectionPending: false,
      };
    }
    const expanded = await this.structure.expand({
      organizationId,
      focusNodeId: privateNodeKey(organizationId, identity),
      depth,
      maxNodes: GRAPH_EXPLORE_LIMITS.maxNodes,
      maxEdges: GRAPH_EXPLORE_LIMITS.maxEdges,
      maxFrontier: GRAPH_EXPLORE_LIMITS.maxHopFrontier,
      maxHopCandidates: GRAPH_EXPLORE_LIMITS.maxHopCandidates,
    });
    const assembled = await this.assembler.structuralEdges(
      actor,
      organizationId,
      expanded.edges,
      completeness,
    );
    const refs = expanded.nodes.flatMap((node) => {
      if (
        !node.sourceId ||
        node.kind === 'curated_node' ||
        node.kind === 'semantic_entity'
      )
        return [];
      return [{ kind: node.kind, id: node.sourceId }];
    });
    return {
      nodes: await this.assembler.sourceNodes(
        actor,
        organizationId,
        refs,
        completeness,
      ),
      edges: assembled.items,
      truncated: expanded.truncated,
      projectionPending: assembled.projectionPending,
    };
  }

  private async curatedForSeed(
    actor: OrganizationActorContext,
    organizationId: string,
    seed: GraphNode,
    depth: number,
    completeness: GraphCompleteness,
  ) {
    const auth = await this.assembler.authorize(actor, organizationId);
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    let frontier = [seed.id];
    const visited = new Set(frontier);
    let truncated = false;

    for (let hop = 1; hop <= depth; hop++) {
      const boundedFrontier = frontier.slice(
        0,
        GRAPH_EXPLORE_LIMITS.maxHopFrontier,
      );
      if (frontier.length > boundedFrontier.length) truncated = true;
      const next: string[] = [];
      for (const externalId of boundedFrontier) {
        const identity = decodeNodeIdOrNotFound(externalId);
        if (identity[1] === 'e') continue;
        const rawId = identity[1] === 'c' ? identity[2] : identity[3];
        const rows = await this.curated.listConnectedEdges(
          organizationId,
          rawId,
          GRAPH_EXPLORE_LIMITS.maxHopCandidates + 1,
        );
        if (rows.length > GRAPH_EXPLORE_LIMITS.maxHopCandidates)
          truncated = true;
        for (const row of rows.slice(
          0,
          GRAPH_EXPLORE_LIMITS.maxHopCandidates,
        )) {
          const edge = await this.assembler.curatedEdge(
            actor,
            organizationId,
            row,
            auth.canManageCurated,
            completeness,
          );
          if (!edge) continue;
          edges.set(edge.id, edge);
          for (const endpointId of [edge.sourceNodeId, edge.targetNodeId]) {
            if (visited.has(endpointId)) continue;
            visited.add(endpointId);
            const endpoint = await this.resolveNode(
              actor,
              organizationId,
              endpointId,
              completeness,
              auth.canManageCurated,
            );
            if (endpoint) {
              nodes.set(endpoint.id, endpoint);
              next.push(endpoint.id);
            }
          }
          if (
            edges.size >= GRAPH_EXPLORE_LIMITS.maxEdges ||
            nodes.size >= GRAPH_EXPLORE_LIMITS.maxNodes
          ) {
            truncated = true;
            break;
          }
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }

    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      truncated,
    };
  }

  private async semanticForSeed(
    organizationId: string,
    seed: GraphNode,
    completeness: GraphCompleteness,
  ) {
    const identity = decodeNodeIdOrNotFound(seed.id);
    const sourceId =
      identity[1] === 'e'
        ? identity[3]
        : identity[1] === 's' && identity[2] === 'wiki_document'
          ? identity[3]
          : null;
    if (!sourceId) return this.emptyTraversal();
    const expectedGenerationId =
      identity[1] === 'e' ? identity[4] : undefined;
    const view = await this.semantic.view(
      organizationId,
      sourceId,
      expectedGenerationId,
    );
    if (!view) return this.emptyTraversal();
    const entities = view.entities.slice(
      0,
      GRAPH_EXPLORE_LIMITS.maxSemanticEntitiesPerDocument,
    );
    const relations = view.relations.slice(
      0,
      GRAPH_EXPLORE_LIMITS.maxSemanticRelationsPerDocument,
    );
    return {
      nodes: entities.map((entity) =>
        this.assembler.semanticNode(view, entity, completeness),
      ),
      edges: this.assembler.semanticEdges(
        { ...view, entities, relations },
        completeness,
      ),
      truncated:
        view.entities.length > entities.length ||
        view.relations.length > relations.length,
    };
  }

  private async resolveNode(
    actor: OrganizationActorContext,
    organizationId: string,
    nodeId: string,
    completeness: GraphCompleteness,
    canManageCurated: boolean,
  ) {
    const identity = decodeNodeIdOrNotFound(nodeId);
    if (identity[1] === 's')
      return this.assembler.sourceNode(
        actor,
        organizationId,
        identity[2],
        identity[3],
        completeness,
      );
    if (identity[1] === 'c') {
      const row = await this.curated.nodeById(organizationId, identity[2]);
      return row
        ? this.assembler.curatedNode(
            row,
            canManageCurated,
            completeness,
          )
        : null;
    }
    const view = await this.semantic.view(
      organizationId,
      identity[3],
      identity[4],
    );
    const entity = view?.entities.find((row) => row.key === identity[5]);
    return view && entity
      ? this.assembler.semanticNode(view, entity, completeness)
      : null;
  }

  private emptyTraversal() {
    return {
      nodes: [] as GraphNode[],
      edges: [] as GraphEdge[],
      truncated: false,
    };
  }

  private uniqueNodes(nodes: readonly GraphNode[]) {
    return [...new Map(nodes.map((node) => [node.id, node])).values()];
  }

  private uniqueEdges(edges: readonly GraphEdge[]) {
    return [...new Map(edges.map((edge) => [edge.id, edge])).values()];
  }
}
