import { Injectable } from '@nestjs/common';

import type { CuratedEdge, CuratedNode } from '@/knowledge-graph/domain/curated-graph';
import type { GraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import { graphPermissions } from '@/knowledge-graph/domain/graph-read-contract';
import type {
  GraphEdge,
  GraphNode,
  GraphProjectionState,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import { GraphOwnerReadService } from '@/knowledge-graph/graph-owner-read.service';
import {
  curatedEdgeId,
  curatedNodeId,
  sourceNodeId,
} from '@/knowledge-graph/graph-read-support';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';
import { ProjectionFreshnessRepository } from '@/knowledge-graph/infrastructure/persistence/projection-freshness.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

@Injectable()
export class GraphCuratedAssemblerService {
  constructor(
    private readonly curated: CuratedGraphQueryRepository,
    private readonly owners: GraphOwnerReadService,
    private readonly freshness: ProjectionFreshnessRepository,
  ) {}

  async curatedNode(
    row: CuratedNode,
    canManageCurated: boolean,
    completeness: GraphCompleteness,
    connectedEdgeCount?: number,
  ): Promise<GraphNode> {
    const projectionState = await this.projectionState(
      row.organizationId,
      'curated_node',
      row.id,
      row.revision,
      row.updatedAt,
    );
    return {
      id: curatedNodeId(row.id),
      kind: 'curated_node',
      title: row.title,
      factClass: 'user_curated',
      sourceRef: {
        kind: 'curated_node',
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
      },
      permissions: graphPermissions({
        factClass: 'user_curated',
        canWriteSource: false,
        canManageCurated,
      }),
      editTarget: canManageCurated
        ? { kind: 'curated_node', nodeId: row.id, revision: row.revision }
        : { kind: 'none', reason: 'not_permitted' },
      projectionState,
      completeness,
      provenance: null,
      ...(connectedEdgeCount === undefined ? {} : { connectedEdgeCount }),
    };
  }

  async curatedEdge(
    actor: OrganizationActorContext,
    organizationId: string,
    row: CuratedEdge,
    canManageCurated: boolean,
    completeness: GraphCompleteness,
  ): Promise<GraphEdge | null> {
    const [source, target, projectionState] = await Promise.all([
      this.endpoint(actor, organizationId, row.sourceNodeKind, row.sourceNodeId),
      this.endpoint(actor, organizationId, row.targetNodeKind, row.targetNodeId),
      this.projectionState(
        row.organizationId,
        'curated_edge',
        row.id,
        row.revision,
        row.updatedAt,
      ),
    ]);
    if (!source || !target) return null;
    return {
      id: curatedEdgeId(row.id),
      relation: 'curated',
      sourceNodeId: source.id,
      targetNodeId: target.id,
      directed: row.directed,
      predicate: row.predicate,
      factClass: 'user_curated',
      sourceRef: null,
      permissions: graphPermissions({
        factClass: 'user_curated',
        canWriteSource: false,
        canManageCurated,
      }),
      editTarget: canManageCurated
        ? { kind: 'curated_edge', edgeId: row.id, revision: row.revision }
        : { kind: 'none', reason: 'not_permitted' },
      projectionState,
      completeness,
      provenance: null,
    };
  }

  private async projectionState(
    organizationId: string,
    kind: 'curated_node' | 'curated_edge',
    id: string,
    revision: number,
    updatedAt: Date,
  ): Promise<GraphProjectionState> {
    const [state] = await this.freshness.freshnessBatch(organizationId, [
      { kind, id },
    ]);
    const desiredSeq = Math.max(revision, state?.desiredSeq ?? revision);
    const appliedSeq = state?.appliedSeq ?? null;
    const status =
      state?.projectionStatus === 'failed'
        ? 'failed'
        : state &&
            !state.deleted &&
            state.fresh &&
            appliedSeq !== null &&
            appliedSeq >= revision &&
            appliedSeq >= desiredSeq
          ? 'applied'
          : 'pending';

    return {
      status,
      desiredSeq,
      appliedSeq,
      sourceUpdatedAt: updatedAt.toISOString(),
    };
  }

  private async endpoint(
    actor: OrganizationActorContext,
    organizationId: string,
    kind: CuratedEdge['sourceNodeKind'],
    id: string,
  ) {
    if (kind === 'curated_node') {
      return (await this.curated.nodeById(organizationId, id))
        ? { id: curatedNodeId(id) }
        : null;
    }
    const [current] = await this.owners.currentSources(actor, organizationId, [
      { kind, id },
    ]);
    return current ? { id: sourceNodeId(kind, id) } : null;
  }
}
