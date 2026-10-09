import { Injectable } from '@nestjs/common';

import type { GraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import {
  KnowledgeGraphEdgeNotFoundError,
  KnowledgeGraphNodeNotFoundError,
} from '@/knowledge-graph/domain/graph-read.error';
import type {
  GraphEdge,
  GraphNode,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import { GraphCompletenessService } from '@/knowledge-graph/graph-completeness.service';
import { GraphReadAssemblerService } from '@/knowledge-graph/graph-read-assembler.service';
import {
  decodeEdgeIdOrNotFound,
  decodeNodeIdOrNotFound,
  type GraphNodeKind,
  identityKind,
  privateNodeKey,
} from '@/knowledge-graph/graph-read-support';
import { GraphSemanticReadService } from '@/knowledge-graph/graph-semantic-read.service';
import { KnowledgeGraphStructureReader } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.provider';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';
import { KnowledgeGraphEdgeListService } from '@/knowledge-graph/knowledge-graph-edge-list.service';
import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

@Injectable()
export class KnowledgeGraphDetailService {
  constructor(
    private readonly assembler: GraphReadAssemblerService,
    private readonly structure: KnowledgeGraphStructureReader,
    private readonly curated: CuratedGraphQueryRepository,
    private readonly semantic: GraphSemanticReadService,
    private readonly corrections: SemanticCorrectionService,
    private readonly edgeList: KnowledgeGraphEdgeListService,
    private readonly completeness: GraphCompletenessService,
  ) {}

  async node(
    actor: OrganizationActorContext,
    organizationId: string,
    nodeId: string,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ): Promise<GraphNode> {
    const auth = await this.assembler.authorize(actor, organizationId);
    const completeness =
      await this.completeness.forOrganization(organizationId);
    const identity = decodeNodeIdOrNotFound(nodeId);
    const kind = identityKind(identity);
    if (allowedNodeKinds && !allowedNodeKinds.includes(kind))
      throw new KnowledgeGraphNodeNotFoundError();

    let node: GraphNode | null = null;
    if (identity[1] === 's') {
      node = await this.assembler.sourceNode(
        actor,
        organizationId,
        identity[2],
        identity[3],
        completeness,
      );
      if (node) {
        node = {
          ...node,
          connectedEdgeCount: (
            await this.edgeList.visibleEdgesForNode(
              actor,
              organizationId,
              nodeId,
              allowedNodeKinds,
            )
          ).length,
        };
      }
    } else if (identity[1] === 'c') {
      const row = await this.curated.nodeById(organizationId, identity[2]);
      if (row) {
        node = await this.assembler.curatedNode(
          row,
          auth.canManageCurated,
          completeness,
          await this.curated.countConnectedEdges(organizationId, row.id),
        );
      }
    } else {
      const view = await this.semantic.view(
        organizationId,
        identity[3],
        identity[4],
      );
      const entity = view?.entities.find((row) => row.key === identity[5]);
      if (view && entity) {
        const edges = this.assembler.semanticEdges(
          this.boundedSemanticView(view),
          completeness,
        );
        node = this.assembler.semanticNode(
          view,
          entity,
          completeness,
          edges.filter(
            (edge) =>
              edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId,
          ).length,
        );
      }
    }
    if (!node) throw new KnowledgeGraphNodeNotFoundError();
    await this.assembler.authorize(actor, organizationId);
    if (identity[1] === 's') {
      const current = await this.assembler.sourceNode(
        actor,
        organizationId,
        identity[2],
        identity[3],
        completeness,
      );
      if (!current) throw new KnowledgeGraphNodeNotFoundError();
      node = { ...current, connectedEdgeCount: node.connectedEdgeCount };
    }
    return node;
  }

  async edge(
    actor: OrganizationActorContext,
    organizationId: string,
    edgeId: string,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ): Promise<GraphEdge> {
    const auth = await this.assembler.authorize(actor, organizationId);
    const completeness =
      await this.completeness.forOrganization(organizationId);
    const identity = decodeEdgeIdOrNotFound(edgeId);
    let edge: GraphEdge | null = null;

    if (identity[1] === 'r') {
      edge = await this.structuralEdge(
        actor,
        organizationId,
        identity,
        completeness,
      );
    } else if (identity[1] === 'ce') {
      const row = await this.curated.edgeById(organizationId, identity[2]);
      if (row) {
        edge = await this.assembler.curatedEdge(
          actor,
          organizationId,
          row,
          auth.canManageCurated,
          completeness,
        );
      }
    } else if (identity[1] === 'sr') {
      const view = await this.semantic.view(
        organizationId,
        identity[2],
        identity[3],
      );
      edge = view
        ? (this.assembler
            .semanticEdges(this.boundedSemanticView(view), completeness)
            .find((row) => row.id === edgeId) ?? null)
        : null;
    } else if (identity[1] === 'm') {
      const view = await this.semantic.view(
        organizationId,
        identity[2],
        identity[3],
      );
      edge = view
        ? (this.assembler
            .semanticEdges(this.boundedSemanticView(view), completeness)
            .find((row) => row.id === edgeId) ?? null)
        : null;
    } else {
      const correction = await this.corrections.findById(
        organizationId,
        identity[2],
      );
      if (correction?.status === 'active') {
        const view = await this.semantic.view(
          organizationId,
          correction.sourceId,
        );
        edge = view
          ? (this.assembler
              .semanticEdges(this.boundedSemanticView(view), completeness)
              .find((row) => row.id === edgeId) ?? null)
          : null;
      }
    }

    if (!edge || !this.allowedEdge(edge, allowedNodeKinds))
      throw new KnowledgeGraphEdgeNotFoundError();
    return edge;
  }

  private async structuralEdge(
    actor: OrganizationActorContext,
    organizationId: string,
    identity: Extract<
      ReturnType<typeof decodeEdgeIdOrNotFound>,
      readonly [1, 'r', ...unknown[]]
    >,
    completeness: GraphCompleteness,
  ) {
    const source = decodeNodeIdOrNotFound(identity[3]);
    const target = decodeNodeIdOrNotFound(identity[4]);
    const row = await this.structure.edgeDetail({
      organizationId,
      relation: identity[2],
      sourceNodeId: privateNodeKey(organizationId, source),
      targetNodeId: privateNodeKey(organizationId, target),
    });
    if (!row) return null;
    const assembled = await this.assembler.structuralEdges(
      actor,
      organizationId,
      [row],
      completeness,
    );
    return (
      assembled.items.find((edge) => edge.id === identity[3] || edge.id) ?? null
    );
  }

  private allowedEdge(
    edge: GraphEdge,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ) {
    if (!allowedNodeKinds) return true;
    try {
      return (
        allowedNodeKinds.includes(
          identityKind(decodeNodeIdOrNotFound(edge.sourceNodeId)),
        ) &&
        allowedNodeKinds.includes(
          identityKind(decodeNodeIdOrNotFound(edge.targetNodeId)),
        )
      );
    } catch {
      return false;
    }
  }

  private boundedSemanticView<
    T extends {
      entities: readonly unknown[];
      relations: readonly unknown[];
    },
  >(view: T) {
    return {
      ...view,
      entities: view.entities.slice(0, 50),
      relations: view.relations.slice(0, 100),
    } as T;
  }
}
