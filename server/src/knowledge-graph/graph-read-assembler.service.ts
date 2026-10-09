import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { ApplicationError } from '@/application.error';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import type { CuratedEdge, CuratedNode } from '@/knowledge-graph/domain/curated-graph';
import type { GraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import { KnowledgeGraphAuthorizationUnavailableError } from '@/knowledge-graph/domain/graph-query.error';
import { assertKnowledgeGraphQueryEnabled } from '@/knowledge-graph/domain/graph-read.error';
import type { GraphEdge, GraphNode } from '@/knowledge-graph/dto/graph-snapshot.dto';
import { GraphCuratedAssemblerService } from '@/knowledge-graph/graph-curated-assembler.service';
import { GraphOwnerReadService } from '@/knowledge-graph/graph-owner-read.service';
import { type GraphNodeKind } from '@/knowledge-graph/graph-read-support';
import { GraphSemanticAssemblerService } from '@/knowledge-graph/graph-semantic-assembler.service';
import type { SemanticReadView } from '@/knowledge-graph/graph-semantic-read.service';
import type { StructureEdgeRecord } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.provider';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

@Injectable()
export class GraphReadAssemblerService {
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly access: GraphSourceAccessProvider,
    private readonly owners: GraphOwnerReadService,
    private readonly curated: GraphCuratedAssemblerService,
    private readonly semantic: GraphSemanticAssemblerService,
  ) {}

  async authorize(actor: OrganizationActorContext, organizationId: string) {
    assertKnowledgeGraphQueryEnabled(this.config);
    try {
      await this.access.assertReadable(actor, organizationId);
      return {
        canManageCurated: await this.access.isAdministrator(
          actor,
          organizationId,
        ),
      };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new KnowledgeGraphAuthorizationUnavailableError({ cause: error });
    }
  }

  sourceNode(
    actor: OrganizationActorContext,
    organizationId: string,
    kind: Exclude<GraphNodeKind, 'curated_node' | 'semantic_entity'>,
    sourceId: string,
    completeness: GraphCompleteness,
  ): Promise<GraphNode | null> {
    return this.owners.sourceNode(
      actor,
      organizationId,
      kind,
      sourceId,
      completeness,
    );
  }

  sourceNodes(
    actor: OrganizationActorContext,
    organizationId: string,
    refs: readonly {
      kind: Exclude<GraphNodeKind, 'curated_node' | 'semantic_entity'>;
      id: string;
    }[],
    completeness: GraphCompleteness,
  ): Promise<GraphNode[]> {
    return this.owners.sourceNodes(
      actor,
      organizationId,
      refs,
      completeness,
    );
  }

  curatedNode(
    row: CuratedNode,
    canManageCurated: boolean,
    completeness: GraphCompleteness,
    connectedEdgeCount?: number,
  ): Promise<GraphNode> {
    return this.curated.curatedNode(
      row,
      canManageCurated,
      completeness,
      connectedEdgeCount,
    );
  }

  curatedEdge(
    actor: OrganizationActorContext,
    organizationId: string,
    row: CuratedEdge,
    canManageCurated: boolean,
    completeness: GraphCompleteness,
  ): Promise<GraphEdge | null> {
    return this.curated.curatedEdge(
      actor,
      organizationId,
      row,
      canManageCurated,
      completeness,
    );
  }

  semanticNode(
    view: SemanticReadView,
    entity: SemanticReadView['entities'][number],
    completeness: GraphCompleteness,
    connectedEdgeCount?: number,
  ): GraphNode {
    return this.semantic.semanticNode(
      view,
      entity,
      completeness,
      connectedEdgeCount,
    );
  }

  semanticEdges(
    view: SemanticReadView,
    completeness: GraphCompleteness,
  ): GraphEdge[] {
    return this.semantic.semanticEdges(view, completeness);
  }

  structuralEdges(
    actor: OrganizationActorContext,
    organizationId: string,
    rows: readonly StructureEdgeRecord[],
    completeness: GraphCompleteness,
  ): Promise<{ items: GraphEdge[]; projectionPending: boolean }> {
    return this.owners.structuralEdges(
      actor,
      organizationId,
      rows,
      completeness,
    );
  }

  currentSources(
    actor: OrganizationActorContext,
    organizationId: string,
    refs: readonly {
      kind: Exclude<GraphNodeKind, 'curated_node' | 'semantic_entity'>;
      id: string;
    }[],
  ) {
    return this.owners.currentSources(actor, organizationId, refs);
  }
}
