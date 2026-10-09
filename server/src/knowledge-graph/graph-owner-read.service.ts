import { Injectable } from '@nestjs/common';

import { ApplicationError } from '@/application.error';
import type { GraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import { KnowledgeGraphAuthorizationUnavailableError } from '@/knowledge-graph/domain/graph-query.error';
import { graphPermissions } from '@/knowledge-graph/domain/graph-read-contract';
import type {
  GraphEdge,
  GraphNode,
  GraphProjectionState,
  GraphSourceRef,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import {
  type GraphNodeKind,
  sourceNodeId,
  structuralEdgeId,
} from '@/knowledge-graph/graph-read-support';
import type { StructureEdgeRecord } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.provider';
import {
  type ProjectionFreshness,
  ProjectionFreshnessRepository,
} from '@/knowledge-graph/infrastructure/persistence/projection-freshness.repository';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

export type CurrentGraphSource = {
  kind: Exclude<GraphNodeKind, 'curated_node' | 'semantic_entity'>;
  id: string;
  title: string;
  updatedAt: Date | null;
};

@Injectable()
export class GraphOwnerReadService {
  constructor(
    private readonly snapshots: GraphSourceSnapshotProvider,
    private readonly freshness: ProjectionFreshnessRepository,
  ) {}

  async sourceNode(
    actor: OrganizationActorContext,
    organizationId: string,
    kind: Exclude<GraphNodeKind, 'curated_node' | 'semantic_entity'>,
    sourceId: string,
    completeness: GraphCompleteness,
  ): Promise<GraphNode | null> {
    return (
      (
        await this.sourceNodes(
          actor,
          organizationId,
          [{ kind, id: sourceId }],
          completeness,
        )
      )[0] ?? null
    );
  }

  async sourceNodes(
    actor: OrganizationActorContext,
    organizationId: string,
    refs: readonly {
      kind: Exclude<GraphNodeKind, 'curated_node' | 'semantic_entity'>;
      id: string;
    }[],
    completeness: GraphCompleteness,
  ): Promise<GraphNode[]> {
    const current = await this.currentSources(actor, organizationId, refs);
    const projection = await this.freshness.freshnessBatch(
      organizationId,
      current.map((row) => ({
        kind: this.projectionKind(row.kind),
        id: row.id,
      })),
    );
    const projectionByKey = new Map(
      projection.map((row) => [`${row.kind}:${row.id}`, row]),
    );
    return current.map((row) =>
      this.currentSourceNode(
        row,
        projectionByKey.get(`${this.projectionKind(row.kind)}:${row.id}`),
        completeness,
      ),
    );
  }

  async structuralEdges(
    actor: OrganizationActorContext,
    organizationId: string,
    rows: readonly StructureEdgeRecord[],
    completeness: GraphCompleteness,
  ): Promise<{ items: GraphEdge[]; projectionPending: boolean }> {
    const ownerRefs = rows
      .filter((row) => row.ownerKind && row.ownerSourceId)
      .map((row) => ({
        kind: this.projectionKind(row.ownerKind!),
        id: row.ownerSourceId!,
      }));
    const freshness = await this.freshness.freshnessBatch(
      organizationId,
      this.uniqueRefs(ownerRefs),
    );
    const freshnessByKey = new Map(
      freshness.map((item) => [`${item.kind}:${item.id}`, item]),
    );
    const endpointRefs = rows.flatMap((row) => [
      this.endpointRef(row.sourceNodeKind, row.sourceNodeSourceId),
      this.endpointRef(row.targetNodeKind, row.targetNodeSourceId),
    ]);
    const current = await this.currentSources(
      actor,
      organizationId,
      endpointRefs.filter((row): row is NonNullable<typeof row> =>
        Boolean(row),
      ),
    );
    const currentByKey = new Map(
      current.map((item) => [`${item.kind}:${item.id}`, item]),
    );
    const items: GraphEdge[] = [];
    let projectionPending = false;
    for (const row of rows) {
      if (!row.ownerKind || !row.ownerSourceId) continue;
      const ownerFreshness = freshnessByKey.get(
        `${this.projectionKind(row.ownerKind)}:${row.ownerSourceId}`,
      );
      if (!ownerFreshness?.fresh) {
        projectionPending = true;
        continue;
      }
      const source = this.currentForEndpoint(row, 'source', currentByKey);
      const target = this.currentForEndpoint(row, 'target', currentByKey);
      if (!source || !target) continue;
      items.push({
        id: structuralEdgeId(row.relation, source.id, target.id),
        relation: row.relation,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        directed: true,
        predicate: row.predicate,
        factClass: 'authoritative',
        sourceRef: this.sourceRef(
          currentByKey.get(`${row.ownerKind}:${row.ownerSourceId}`) ?? null,
        ),
        permissions: graphPermissions({
          factClass: 'authoritative',
          canWriteSource: false,
          canManageCurated: false,
        }),
        editTarget: { kind: 'none', reason: 'authoritative' },
        projectionState: this.projectionState(ownerFreshness),
        completeness,
        provenance: null,
      });
    }
    return { items, projectionPending };
  }

  async currentSources(
    actor: OrganizationActorContext,
    organizationId: string,
    refs: readonly {
      kind: Exclude<GraphNodeKind, 'curated_node' | 'semantic_entity'>;
      id: string;
    }[],
  ): Promise<CurrentGraphSource[]> {
    const unique = this.uniqueRefs(refs);
    const wikiIds = unique
      .filter((row) => row.kind === 'wiki_document')
      .map((row) => row.id);
    const projectIds = unique
      .filter((row) => row.kind === 'project')
      .map((row) => row.id);
    const ticketIds = unique
      .filter((row) => row.kind === 'ticket')
      .map((row) => row.id);
    const meetingIds = unique
      .filter((row) => row.kind === 'meeting')
      .map((row) => row.id);
    const memberIds = unique
      .filter((row) => row.kind === 'member')
      .map((row) => row.id);
    try {
      const [wiki, projects, tickets, meetings, members] = await Promise.all([
        this.snapshots.wikiForGraph(organizationId, wikiIds),
        this.snapshots.projectsForGraph(organizationId, projectIds),
        this.snapshots.ticketsForGraph(organizationId, ticketIds),
        this.snapshots.meetingsForGraph(organizationId, meetingIds),
        this.snapshots.membersForGraph(actor, organizationId, memberIds),
      ]);
      return [
        ...wiki.map((row) => ({
          kind: 'wiki_document' as const,
          id: row.id,
          title: row.title,
          updatedAt: row.updatedAt,
        })),
        ...projects.map((row) => ({
          kind: 'project' as const,
          id: row.id,
          title: row.name,
          updatedAt: row.updatedAt,
        })),
        ...tickets.map((row) => ({
          kind: 'ticket' as const,
          id: row.id,
          title: row.title,
          updatedAt: row.updatedAt,
        })),
        ...meetings.map((row) => ({
          kind: 'meeting' as const,
          id: row.id,
          title: row.title,
          updatedAt: row.updatedAt,
        })),
        ...members.map((row) => ({
          kind: 'member' as const,
          id: row.userId,
          title: row.user.name,
          updatedAt: null,
        })),
      ];
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new KnowledgeGraphAuthorizationUnavailableError({ cause: error });
    }
  }

  private currentSourceNode(
    current: CurrentGraphSource,
    projection: ProjectionFreshness | undefined,
    completeness: GraphCompleteness,
  ): GraphNode {
    return {
      id: sourceNodeId(current.kind, current.id),
      kind: current.kind,
      title: current.title,
      factClass: 'authoritative',
      sourceRef: this.sourceRef(current),
      permissions: graphPermissions({
        factClass: 'authoritative',
        canWriteSource: false,
        canManageCurated: false,
      }),
      editTarget: {
        kind: 'owner',
        ownerKind: current.kind,
        sourceId: current.id,
      },
      projectionState: projection ? this.projectionState(projection) : null,
      completeness,
      provenance: null,
    };
  }

  private currentForEndpoint(
    row: StructureEdgeRecord,
    endpoint: 'source' | 'target',
    current: ReadonlyMap<string, CurrentGraphSource>,
  ) {
    const kind =
      endpoint === 'source' ? row.sourceNodeKind : row.targetNodeKind;
    const id =
      endpoint === 'source' ? row.sourceNodeSourceId : row.targetNodeSourceId;
    if (!id || kind === 'curated_node' || kind === 'semantic_entity')
      return null;
    const source = current.get(`${kind}:${id}`);
    return source ? { id: sourceNodeId(kind, id) } : null;
  }

  private endpointRef(
    kind: StructureEdgeRecord['sourceNodeKind'],
    id: string | null,
  ) {
    if (!id || kind === 'curated_node' || kind === 'semantic_entity')
      return null;
    return { kind, id } as const;
  }

  private sourceRef(current: CurrentGraphSource | null): GraphSourceRef | null {
    return current
      ? {
          kind: current.kind,
          id: current.id,
          title: current.title,
          updatedAt: current.updatedAt?.toISOString() ?? null,
        }
      : null;
  }

  private projectionState(row: ProjectionFreshness): GraphProjectionState {
    return {
      status: row.fresh
        ? 'applied'
        : row.projectionStatus === 'failed'
          ? 'failed'
          : 'pending',
      desiredSeq: row.desiredSeq,
      appliedSeq: row.appliedSeq,
      sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
    };
  }

  private projectionKind(
    kind: Exclude<GraphNodeKind, 'curated_node' | 'semantic_entity'>,
  ) {
    return kind === 'member' ? ('membership' as const) : kind;
  }

  private uniqueRefs<T extends { kind: string; id: string }>(
    refs: readonly T[],
  ) {
    return [
      ...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values(),
    ];
  }
}
