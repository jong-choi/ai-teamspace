import { Injectable } from '@nestjs/common';

import { GRAPH_EXPLORE_LIMITS } from '@/knowledge-graph/domain/graph-explore-limits';
import { KnowledgeGraphNodeNotFoundError } from '@/knowledge-graph/domain/graph-read.error';
import type {
  ExploreQuery,
  GraphEdge,
  GraphNode,
  GraphSnapshot,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import { GraphCompletenessService } from '@/knowledge-graph/graph-completeness.service';
import { GraphExploreResultService } from '@/knowledge-graph/graph-explore-result.service';
import { GraphExploreTraversalService } from '@/knowledge-graph/graph-explore-traversal.service';
import { GraphReadAssemblerService } from '@/knowledge-graph/graph-read-assembler.service';
import type { GraphNodeKind } from '@/knowledge-graph/graph-read-support';
import { KnowledgeGraphDetailService } from '@/knowledge-graph/knowledge-graph-detail.service';
import { KnowledgeGraphSearchService } from '@/knowledge-graph/knowledge-graph-search.service';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

@Injectable()
export class KnowledgeGraphExploreService {
  constructor(
    private readonly assembler: GraphReadAssemblerService,
    private readonly traversal: GraphExploreTraversalService,
    private readonly results: GraphExploreResultService,
    private readonly detail: KnowledgeGraphDetailService,
    private readonly search: KnowledgeGraphSearchService,
    private readonly completeness: GraphCompletenessService,
  ) {}

  async explore(
    actor: OrganizationActorContext,
    organizationId: string,
    query: ExploreQuery,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ): Promise<GraphSnapshot> {
    await this.assembler.authorize(actor, organizationId);
    const completeness =
      await this.completeness.forOrganization(organizationId);
    const depth = query.q
      ? 1
      : Math.min(query.depth, GRAPH_EXPLORE_LIMITS.maxDepth);
    const seeds = await this.seeds(
      actor,
      organizationId,
      query,
      allowedNodeKinds,
    );
    if (!seeds.length) return this.results.empty(completeness);

    const nodeMap = new Map(seeds.map((node) => [node.id, node]));
    const edgeMap = new Map<string, GraphEdge>();
    let projectionPending = seeds.some(
      (node) => node.projectionState?.status !== 'applied',
    );
    let sourceTruncated = false;

    for (const seed of seeds) {
      const result = await this.traversal.traverseSeed(
        actor,
        organizationId,
        seed,
        depth,
        completeness,
      );
      result.nodes.forEach((node) => nodeMap.set(node.id, node));
      result.edges.forEach((edge) => edgeMap.set(edge.id, edge));
      projectionPending ||= result.projectionPending;
      sourceTruncated ||= result.truncated;
    }

    return this.results.build({
      organizationId,
      query,
      depth,
      seeds,
      nodes: [...nodeMap.values()],
      edges: [...edgeMap.values()],
      sourceTruncated,
      projectionPending,
      completeness,
    });
  }

  private async seeds(
    actor: OrganizationActorContext,
    organizationId: string,
    query: ExploreQuery,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ) {
    if (query.q) {
      const result = await this.search.search(
        actor,
        organizationId,
        { q: query.q, mode: 'hybrid', limit: 5 },
        allowedNodeKinds,
      );
      const nodes: GraphNode[] = [];
      for (const hit of result.items) {
        try {
          nodes.push(
            await this.detail.node(
              actor,
              organizationId,
              hit.source.nodeId,
              allowedNodeKinds,
            ),
          );
        } catch (error) {
          if (!(error instanceof KnowledgeGraphNodeNotFoundError))
            throw error;
        }
      }
      return this.uniqueNodes(nodes);
    }
    if (!query.focusId) return [];
    const node = await this.detail.node(
      actor,
      organizationId,
      query.focusId,
      allowedNodeKinds,
    );
    if (query.focusKind && node.kind !== query.focusKind)
      throw new KnowledgeGraphNodeNotFoundError();
    return [node];
  }

  private uniqueNodes(nodes: readonly GraphNode[]) {
    return [...new Map(nodes.map((node) => [node.id, node])).values()];
  }
}
