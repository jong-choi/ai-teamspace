import { Injectable } from '@nestjs/common';

import type { GraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import {
  decodeGraphEdgeId,
  decodeGraphNodeId,
} from '@/knowledge-graph/domain/graph-identity';
import type {
  GraphEdge,
  GraphEdgeList,
  GraphEdgeListQuery,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import { GraphCompletenessService } from '@/knowledge-graph/graph-completeness.service';
import { GraphReadAssemblerService } from '@/knowledge-graph/graph-read-assembler.service';
import {
  decodeEdgeAfter,
  encodeEdgeNext,
} from '@/knowledge-graph/graph-read-pagination';
import {
  decodeCursorOrScopeMismatch,
  GRAPH_EDGE_RELATION_ORDER,
  type GraphEdgeRelation,
  graphEdgeRelationRank,
  type GraphNodeKind,
  identityKind,
  privateNodeKey,
} from '@/knowledge-graph/graph-read-support';
import { GraphSemanticReadService } from '@/knowledge-graph/graph-semantic-read.service';
import { KnowledgeGraphStructureReader } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.provider';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

const structuralRelations = new Set<GraphEdgeRelation>([
  'wiki_parent',
  'ticket_project',
  'ticket_assignee',
  'ticket_reporter',
  'project_lead',
  'project_creator',
  'meeting_organizer',
  'meeting_attendee',
]);

@Injectable()
export class KnowledgeGraphEdgeListService {
  constructor(
    private readonly assembler: GraphReadAssemblerService,
    private readonly structure: KnowledgeGraphStructureReader,
    private readonly curated: CuratedGraphQueryRepository,
    private readonly semantic: GraphSemanticReadService,
    private readonly completeness: GraphCompletenessService,
  ) {}

  async list(
    actor: OrganizationActorContext,
    organizationId: string,
    query: GraphEdgeListQuery,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ): Promise<GraphEdgeList> {
    const auth = await this.assembler.authorize(actor, organizationId);
    const completeness =
      await this.completeness.forOrganization(organizationId);
    const after = decodeEdgeAfter(organizationId, query);
    const relations = GRAPH_EDGE_RELATION_ORDER.filter(
      (relation) => !query.relation || relation === query.relation,
    );
    if (after && !relations.includes(after.relation)) {
      return {
        items: [],
        totalCount: 0,
        countAccuracy: 'exact',
        nextCursor: null,
        completeness,
      };
    }

    const candidates: GraphEdge[] = [];
    const startRank = after ? graphEdgeRelationRank(after.relation) : -1;
    for (const relation of relations) {
      if (after && graphEdgeRelationRank(relation) < startRank) continue;
      const remaining = query.limit + 1 - candidates.length;
      if (remaining <= 0) break;
      const rows = await this.stream(
        actor,
        organizationId,
        relation,
        after?.relation === relation ? after.id : null,
        remaining,
        auth.canManageCurated,
        completeness,
      );
      candidates.push(
        ...rows.filter((edge) => this.allowed(edge, allowedNodeKinds)),
      );
      if (candidates.length > query.limit) break;
    }

    const items = candidates.slice(0, query.limit);
    return {
      items,
      totalCount: null,
      countAccuracy: 'unknown',
      nextCursor:
        candidates.length > query.limit && items.length
          ? encodeEdgeNext(organizationId, query, items[items.length - 1]!)
          : null,
      completeness,
    };
  }

  async visibleEdgesForNode(
    actor: OrganizationActorContext,
    organizationId: string,
    nodeId: string,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ) {
    const result: GraphEdge[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.list(
        actor,
        organizationId,
        { limit: 100, cursor },
        allowedNodeKinds,
      );
      for (const edge of page.items) {
        if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId)
          result.push(edge);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return result;
  }

  private stream(
    actor: OrganizationActorContext,
    organizationId: string,
    relation: GraphEdgeRelation,
    afterId: string | null,
    limit: number,
    canManageCurated: boolean,
    completeness: GraphCompleteness,
  ) {
    if (structuralRelations.has(relation)) {
      return this.structuralStream(
        actor,
        organizationId,
        relation,
        afterId,
        limit,
        completeness,
      );
    }
    if (relation === 'curated') {
      return this.curatedStream(
        actor,
        organizationId,
        afterId,
        limit,
        canManageCurated,
        completeness,
      );
    }
    return this.semanticStream(
      organizationId,
      relation,
      afterId,
      limit,
      completeness,
    );
  }

  private async structuralStream(
    actor: OrganizationActorContext,
    organizationId: string,
    relation: GraphEdgeRelation,
    afterId: string | null,
    limit: number,
    completeness: GraphCompleteness,
  ) {
    let after = afterId
      ? this.structuralAfter(organizationId, relation, afterId)
      : null;
    const items: GraphEdge[] = [];
    for (let attempt = 0; attempt < 8 && items.length < limit; attempt++) {
      const rows = await this.structure.listStructuralEdges({
        organizationId,
        relation,
        after,
        limit: Math.min(200, Math.max(limit * 3, 20)),
      });
      if (!rows.length) break;
      const assembled = await this.assembler.structuralEdges(
        actor,
        organizationId,
        rows,
        completeness,
      );
      items.push(...assembled.items);
      const last = rows[rows.length - 1]!;
      after = {
        relation,
        sourceNodeId: last.sourceNodeId,
        targetNodeId: last.targetNodeId,
      };
      if (rows.length < Math.min(200, Math.max(limit * 3, 20))) break;
    }
    return items.slice(0, limit);
  }

  private async curatedStream(
    actor: OrganizationActorContext,
    organizationId: string,
    afterId: string | null,
    limit: number,
    canManageCurated: boolean,
    completeness: GraphCompleteness,
  ) {
    let after = afterId ? this.curatedAfter(afterId) : null;
    const items: GraphEdge[] = [];
    for (let attempt = 0; attempt < 8 && items.length < limit; attempt++) {
      const rows = await this.curated.listEdges(organizationId, {
        afterId: after,
        limit: Math.min(200, Math.max(limit * 3, 20)),
      });
      if (!rows.length) break;
      for (const row of rows) {
        const edge = await this.assembler.curatedEdge(
          actor,
          organizationId,
          row,
          canManageCurated,
          completeness,
        );
        if (edge) items.push(edge);
        if (items.length >= limit) break;
      }
      after = rows[rows.length - 1]!.id;
      if (rows.length < Math.min(200, Math.max(limit * 3, 20))) break;
    }
    return items.slice(0, limit);
  }

  private async semanticStream(
    organizationId: string,
    relation: GraphEdgeRelation,
    afterId: string | null,
    limit: number,
    completeness: GraphCompleteness,
  ) {
    const scopes = await this.semantic.searchableScopes(organizationId);
    const views = await this.semantic.views(organizationId, scopes);
    const edges = views.flatMap((view) => {
      const bounded = {
        ...view,
        entities: view.entities.slice(0, 50),
        relations: view.relations.slice(0, 100),
      };
      return this.assembler.semanticEdges(bounded, completeness);
    });
    edges.sort((left, right) => left.id.localeCompare(right.id));
    return edges
      .filter(
        (edge) => edge.relation === relation && (!afterId || edge.id > afterId),
      )
      .slice(0, limit);
  }

  private structuralAfter(
    organizationId: string,
    relation: GraphEdgeRelation,
    edgeId: string,
  ) {
    return decodeCursorOrScopeMismatch(() => {
      const identity = decodeGraphEdgeId(edgeId);
      if (identity[1] !== 'r' || identity[2] !== relation)
        throw new Error('structural edge cursor mismatch');
      const source = decodeGraphNodeId(identity[3]);
      const target = decodeGraphNodeId(identity[4]);
      return {
        relation,
        sourceNodeId: privateNodeKey(organizationId, source),
        targetNodeId: privateNodeKey(organizationId, target),
      };
    });
  }

  private curatedAfter(edgeId: string) {
    return decodeCursorOrScopeMismatch(() => {
      const identity = decodeGraphEdgeId(edgeId);
      if (identity[1] !== 'ce') throw new Error('curated edge cursor mismatch');
      return identity[2];
    });
  }

  private allowed(
    edge: GraphEdge,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ) {
    if (!allowedNodeKinds) return true;
    try {
      return (
        allowedNodeKinds.includes(
          identityKind(decodeGraphNodeId(edge.sourceNodeId)),
        ) &&
        allowedNodeKinds.includes(
          identityKind(decodeGraphNodeId(edge.targetNodeId)),
        )
      );
    } catch {
      return false;
    }
  }
}
