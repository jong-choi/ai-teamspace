import { Injectable } from '@nestjs/common';

import type { GraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import { decodeGraphNodeId } from '@/knowledge-graph/domain/graph-identity';
import type {
  GraphNode,
  GraphNodeList,
  GraphNodeListQuery,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import { GraphCompletenessService } from '@/knowledge-graph/graph-completeness.service';
import { GraphReadAssemblerService } from '@/knowledge-graph/graph-read-assembler.service';
import {
  decodeNodeAfter,
  encodeNodeNext,
} from '@/knowledge-graph/graph-read-pagination';
import {
  decodeCursorOrScopeMismatch,
  GRAPH_NODE_KIND_ORDER,
  type GraphNodeKind,
  graphNodeKindRank,
} from '@/knowledge-graph/graph-read-support';
import { GraphSemanticReadService } from '@/knowledge-graph/graph-semantic-read.service';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';
import { GraphSourceDirectoryProvider } from '@/knowledge-graph/infrastructure/source-directory/graph-source-directory.provider';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

@Injectable()
export class KnowledgeGraphNodeListService {
  constructor(
    private readonly assembler: GraphReadAssemblerService,
    private readonly snapshots: GraphSourceSnapshotProvider,
    private readonly curated: CuratedGraphQueryRepository,
    private readonly directory: GraphSourceDirectoryProvider,
    private readonly semantic: GraphSemanticReadService,
    private readonly completeness: GraphCompletenessService,
  ) {}

  async list(
    actor: OrganizationActorContext,
    organizationId: string,
    query: GraphNodeListQuery,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ): Promise<GraphNodeList> {
    const auth = await this.assembler.authorize(actor, organizationId);
    const completeness =
      await this.completeness.forOrganization(organizationId);
    const after = decodeNodeAfter(organizationId, query);
    const kinds = this.kinds(query.kind, allowedNodeKinds);
    if (after && !kinds.includes(after.kind)) {
      return {
        items: [],
        totalCount: 0,
        countAccuracy: 'exact',
        nextCursor: null,
        completeness,
      };
    }

    const candidates: GraphNode[] = [];
    const startRank = after ? graphNodeKindRank(after.kind) : -1;
    for (const kind of kinds) {
      if (after && graphNodeKindRank(kind) < startRank) continue;
      const remaining = query.limit + 1 - candidates.length;
      if (remaining <= 0) break;
      const streamAfter = after?.kind === kind ? after : null;
      const rows = await this.stream(
        actor,
        organizationId,
        kind,
        query.q ?? null,
        streamAfter,
        remaining,
        auth.canManageCurated,
        completeness,
      );
      candidates.push(...rows);
      if (candidates.length > query.limit) break;
    }

    const items = candidates.slice(0, query.limit);
    const exactCount = await this.exactCount(
      actor,
      organizationId,
      query,
      allowedNodeKinds,
    );
    return {
      items,
      totalCount: exactCount,
      countAccuracy: exactCount === null ? 'unknown' : 'exact',
      nextCursor:
        candidates.length > query.limit && items.length
          ? encodeNodeNext(organizationId, query, items[items.length - 1]!)
          : null,
      completeness,
    };
  }

  private async stream(
    actor: OrganizationActorContext,
    organizationId: string,
    kind: GraphNodeKind,
    q: string | null,
    after: { kind: GraphNodeKind; title: string; id: string } | null,
    limit: number,
    canManageCurated: boolean,
    completeness: GraphCompleteness,
  ) {
    if (
      kind === 'wiki_document' ||
      kind === 'project' ||
      kind === 'ticket' ||
      kind === 'meeting'
    ) {
      return this.ownerStream(
        actor,
        organizationId,
        kind,
        q,
        after,
        limit,
        completeness,
      );
    }
    if (kind === 'member') {
      const rawAfter = after
        ? this.sourceAfter(after.id, 'member', after.title)
        : null;
      const rows = await this.directory.listMembers(actor, organizationId, {
        q,
        after: rawAfter ? { title: after!.title, userId: rawAfter.id } : null,
        limit,
      });
      return this.assembler.sourceNodes(
        actor,
        organizationId,
        rows.map((row) => ({ kind: 'member' as const, id: row.userId })),
        completeness,
      );
    }
    if (kind === 'curated_node') {
      const rawAfter = after ? this.curatedAfter(after.id, after.title) : null;
      const rows = await this.curated.listNodes(organizationId, {
        q,
        after: rawAfter,
        limit,
      });
      return Promise.all(
        rows.map((row) =>
          this.assembler.curatedNode(row, canManageCurated, completeness),
        ),
      );
    }
    return this.semanticStream(organizationId, q, after, limit, completeness);
  }

  private async ownerStream(
    actor: OrganizationActorContext,
    organizationId: string,
    kind: 'wiki_document' | 'project' | 'ticket' | 'meeting',
    q: string | null,
    after: { kind: GraphNodeKind; title: string; id: string } | null,
    limit: number,
    completeness: GraphCompleteness,
  ) {
    const rawAfter = after
      ? this.sourceAfter(after.id, kind, after.title)
      : null;
    const page = { q, after: rawAfter, limit };
    const rows =
      kind === 'wiki_document'
        ? await this.snapshots.listWiki(organizationId, page)
        : kind === 'project'
          ? await this.snapshots.listProjects(organizationId, page)
          : kind === 'ticket'
            ? await this.snapshots.listTickets(organizationId, page)
            : await this.snapshots.listMeetings(organizationId, page);
    return this.assembler.sourceNodes(
      actor,
      organizationId,
      rows.map((row) => ({ kind, id: row.id })),
      completeness,
    );
  }

  private async semanticStream(
    organizationId: string,
    q: string | null,
    after: { kind: GraphNodeKind; title: string; id: string } | null,
    limit: number,
    completeness: GraphCompleteness,
  ) {
    const scopes = await this.semantic.searchableScopes(organizationId);
    const views = await this.semantic.views(organizationId, scopes);
    const folded = q?.toLocaleLowerCase();
    const nodes = views.flatMap((view) =>
      view.entities
        .slice(0, 50)
        .filter(
          (entity) =>
            !folded ||
            entity.displayName.toLocaleLowerCase().includes(folded) ||
            entity.anchor.normalizedName.toLocaleLowerCase().includes(folded),
        )
        .map((entity) =>
          this.assembler.semanticNode(view, entity, completeness),
        ),
    );
    nodes.sort(
      (left, right) =>
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id),
    );
    if (!after) return nodes.slice(0, limit);
    return nodes
      .filter(
        (node) =>
          node.title > after.title ||
          (node.title === after.title && node.id > after.id),
      )
      .slice(0, limit);
  }

  private sourceAfter(
    nodeId: string,
    expectedKind: 'wiki_document' | 'project' | 'ticket' | 'meeting' | 'member',
    title: string,
  ) {
    return decodeCursorOrScopeMismatch(() => {
      const identity = decodeGraphNodeId(nodeId);
      if (identity[1] !== 's' || identity[2] !== expectedKind)
        throw new Error('node cursor kind mismatch');
      return { title, id: identity[3] };
    });
  }

  private curatedAfter(nodeId: string, title: string) {
    return decodeCursorOrScopeMismatch(() => {
      const identity = decodeGraphNodeId(nodeId);
      if (identity[1] !== 'c') throw new Error('curated cursor mismatch');
      return { title, id: identity[2] };
    });
  }

  private async exactCount(
    actor: OrganizationActorContext,
    organizationId: string,
    query: GraphNodeListQuery,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ) {
    const kinds = this.kinds(query.kind, allowedNodeKinds);
    if (kinds.includes('semantic_entity')) return null;
    const counts = await Promise.all(
      kinds.map(async (kind) => {
        if (kind === 'curated_node')
          return this.curated.countNodes(organizationId, query.q);
        if (kind === 'member')
          return this.directory.countMembers(actor, organizationId, query.q);
        if (kind === 'semantic_entity') return 0;
        return this.directory.countOwnerSources(organizationId, kind, query.q);
      }),
    );
    return counts.reduce((sum, value) => sum + value, 0);
  }

  private kinds(
    kind?: GraphNodeKind,
    allowedNodeKinds?: readonly GraphNodeKind[],
  ) {
    return GRAPH_NODE_KIND_ORDER.filter(
      (candidate) =>
        (!kind || candidate === kind) &&
        (!allowedNodeKinds || allowedNodeKinds.includes(candidate)),
    );
  }
}
