import { Injectable } from '@nestjs/common';

import { CuratedGraphService } from '@/knowledge-graph/curated-graph.service';
import type {
  CuratedEdge,
  CuratedNode,
} from '@/knowledge-graph/domain/curated-graph';
import {
  KnowledgeGraphCuratedEdgeNotFoundError,
  KnowledgeGraphCuratedNodeNotFoundError,
} from '@/knowledge-graph/domain/graph-command.error';
import {
  type CreateCuratedEdgeCommandInput,
  type CreateCuratedNodeCommandInput,
  type CuratedEndpointOptionsQuery,
  type UpdateCuratedEdgeCommandInput,
  type UpdateCuratedNodeCommandInput,
} from '@/knowledge-graph/dto/curated-graph-command.dto';
import {
  type CreateSemanticCorrectionCommandInput,
  type QuerySemanticCorrectionsInput,
  type UpdateSemanticCorrectionCommandInput,
} from '@/knowledge-graph/dto/semantic-correction-command.dto';
import { GraphCorrectionCommandService } from '@/knowledge-graph/graph-correction-command.service';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

@Injectable()
export class GraphCommandService {
  constructor(
    private readonly curated: CuratedGraphService,
    private readonly access: GraphSourceAccessProvider,
    private readonly snapshots: GraphSourceSnapshotProvider,
    private readonly curatedQuery: CuratedGraphQueryRepository,
    private readonly correctionCommands: GraphCorrectionCommandService,
  ) {}

  async createCuratedNode(
    organizationId: string,
    actorUserId: string,
    input: CreateCuratedNodeCommandInput,
  ) {
    return this.curatedNodeResult(
      await this.curated.createNode(organizationId, actorUserId, input),
    );
  }

  async updateCuratedNode(
    organizationId: string,
    nodeId: string,
    actorUserId: string,
    input: UpdateCuratedNodeCommandInput,
  ) {
    const { expectedRevision, ...update } = input;
    const updated = await this.curated.updateNode(
      organizationId,
      nodeId,
      actorUserId,
      expectedRevision,
      update,
    );
    if (!updated) throw new KnowledgeGraphCuratedNodeNotFoundError();
    return this.curatedNodeResult(updated);
  }

  async deleteCuratedNode(
    organizationId: string,
    nodeId: string,
    actorUserId: string,
    expectedRevision: number,
  ) {
    const deleted = await this.curated.deleteNode(
      organizationId,
      nodeId,
      actorUserId,
      expectedRevision,
    );
    if (!deleted) throw new KnowledgeGraphCuratedNodeNotFoundError();
  }

  async createCuratedEdge(
    organizationId: string,
    actorUserId: string,
    input: CreateCuratedEdgeCommandInput,
  ) {
    return this.curatedEdgeResult(
      await this.curated.createEdge(organizationId, actorUserId, input),
    );
  }

  async updateCuratedEdge(
    organizationId: string,
    edgeId: string,
    actorUserId: string,
    input: UpdateCuratedEdgeCommandInput,
  ) {
    const { expectedRevision, ...update } = input;
    const updated = await this.curated.updateEdge(
      organizationId,
      edgeId,
      actorUserId,
      expectedRevision,
      update,
    );
    if (!updated) throw new KnowledgeGraphCuratedEdgeNotFoundError();
    return this.curatedEdgeResult(updated);
  }

  async deleteCuratedEdge(
    organizationId: string,
    edgeId: string,
    actorUserId: string,
    expectedRevision: number,
  ) {
    const deleted = await this.curated.deleteEdge(
      organizationId,
      edgeId,
      actorUserId,
      expectedRevision,
    );
    if (!deleted) throw new KnowledgeGraphCuratedEdgeNotFoundError();
  }

  async endpointOptions(
    actor: OrganizationActorContext,
    organizationId: string,
    query: CuratedEndpointOptionsQuery,
  ) {
    await this.access.assertReadable(actor, organizationId);
    const page = { q: query.q ?? null, after: null, limit: query.limit };
    const [curated, wiki, projects, tickets, meetings] = await Promise.all([
      this.curatedQuery.listNodes(organizationId, page),
      this.snapshots.listWiki(organizationId, page),
      this.snapshots.listProjects(organizationId, page),
      this.snapshots.listTickets(organizationId, page),
      this.snapshots.listMeetings(organizationId, page),
    ]);
    const curatedPredicates = [
      'related_to',
      'depends_on',
      'contains',
      'references',
    ] as const;
    const referencePredicate = ['references'] as const;
    const items = [
      ...curated.map((item) => ({
        nodeId: item.id,
        kind: 'curated_node' as const,
        title: item.title,
        allowedPredicates: [...curatedPredicates],
      })),
      ...wiki.map((item) => ({
        nodeId: item.id,
        kind: 'wiki_document' as const,
        title: item.title,
        allowedPredicates: [...referencePredicate],
      })),
      ...projects.map((item) => ({
        nodeId: item.id,
        kind: 'project' as const,
        title: item.name,
        allowedPredicates: [...referencePredicate],
      })),
      ...tickets.map((item) => ({
        nodeId: item.id,
        kind: 'ticket' as const,
        title: item.title,
        allowedPredicates: [...referencePredicate],
      })),
      ...meetings.map((item) => ({
        nodeId: item.id,
        kind: 'meeting' as const,
        title: item.title,
        allowedPredicates: [...referencePredicate],
      })),
    ]
      .filter((item) => !query.kind || item.kind === query.kind)
      .sort(
        (left, right) =>
          left.title.localeCompare(right.title) ||
          left.kind.localeCompare(right.kind) ||
          left.nodeId.localeCompare(right.nodeId),
      )
      .slice(0, query.limit);
    return { items };
  }

  createCorrection(
    actor: OrganizationActorContext,
    organizationId: string,
    actorUserId: string,
    input: CreateSemanticCorrectionCommandInput,
  ) {
    return this.correctionCommands.create(
      actor,
      organizationId,
      actorUserId,
      input,
    );
  }

  listCorrections(
    actor: OrganizationActorContext,
    organizationId: string,
    query: QuerySemanticCorrectionsInput,
  ) {
    return this.correctionCommands.list(actor, organizationId, query);
  }

  updateCorrection(
    organizationId: string,
    correctionId: string,
    actorUserId: string,
    input: UpdateSemanticCorrectionCommandInput,
  ) {
    return this.correctionCommands.update(
      organizationId,
      correctionId,
      actorUserId,
      input,
    );
  }

  deleteCorrection(
    organizationId: string,
    correctionId: string,
    actorUserId: string,
  ) {
    return this.correctionCommands.delete(
      organizationId,
      correctionId,
      actorUserId,
    );
  }

  private curatedNodeResult(node: CuratedNode) {
    return {
      id: node.id,
      kind: node.kind,
      title: node.title,
      properties: node.properties,
      revision: node.revision,
      updatedAt: node.updatedAt.toISOString(),
      projectionState: 'pending' as const,
    };
  }

  private curatedEdgeResult(edge: CuratedEdge) {
    return {
      id: edge.id,
      sourceNodeKind: edge.sourceNodeKind,
      sourceNodeId: edge.sourceNodeId,
      targetNodeKind: edge.targetNodeKind,
      targetNodeId: edge.targetNodeId,
      predicate: edge.predicate,
      directed: edge.directed,
      properties: edge.properties,
      revision: edge.revision,
      updatedAt: edge.updatedAt.toISOString(),
      projectionState: 'pending' as const,
    };
  }
}
