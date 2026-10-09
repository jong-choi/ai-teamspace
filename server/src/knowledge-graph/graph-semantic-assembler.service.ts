import { Injectable } from '@nestjs/common';

import type { GraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import { graphPermissions } from '@/knowledge-graph/domain/graph-read-contract';
import type {
  GraphEdge,
  GraphNode,
  GraphSourceRef,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import {
  assertedEdgeId,
  mentionsEdgeId,
  semanticNodeId,
  semanticRelationEdgeId,
  sourceNodeId,
} from '@/knowledge-graph/graph-read-support';
import type { SemanticReadView } from '@/knowledge-graph/graph-semantic-read.service';

@Injectable()
export class GraphSemanticAssemblerService {
  semanticNode(
    view: SemanticReadView,
    entity: SemanticReadView['entities'][number],
    completeness: GraphCompleteness,
    connectedEdgeCount?: number,
  ): GraphNode {
    return {
      id: semanticNodeId(view.sourceId, view.generationId, entity.key),
      kind: 'semantic_entity',
      title: entity.displayName,
      factClass: 'extracted',
      sourceRef: this.sourceRef(view),
      permissions: graphPermissions({
        factClass: 'extracted',
        canWriteSource: true,
        canManageCurated: false,
      }),
      editTarget: {
        kind: 'semantic_correction',
        sourceId: view.sourceId,
        generationId: view.generationId,
        targetKey: entity.key,
        targetKind: 'entity',
      },
      projectionState: null,
      completeness,
      provenance: {
        extractedName: entity.anchor.normalizedName,
        generationId: view.generationId,
        evidenceDigest: entity.anchor.evidenceDigest,
      },
      ...(connectedEdgeCount === undefined ? {} : { connectedEdgeCount }),
    };
  }

  semanticEdges(
    view: SemanticReadView,
    completeness: GraphCompleteness,
  ): GraphEdge[] {
    const entities = new Map(
      view.entities.map((entity) => [entity.key, entity]),
    );
    const edges = view.entities.map((entity): GraphEdge => ({
      id: mentionsEdgeId(view.sourceId, view.generationId, entity.key),
      relation: 'mentions',
      sourceNodeId: sourceNodeId('wiki_document', view.sourceId),
      targetNodeId: semanticNodeId(
        view.sourceId,
        view.generationId,
        entity.key,
      ),
      directed: true,
      predicate: null,
      factClass: 'extracted',
      sourceRef: this.sourceRef(view),
      permissions: graphPermissions({
        factClass: 'extracted',
        canWriteSource: true,
        canManageCurated: false,
      }),
      editTarget: {
        kind: 'semantic_correction',
        sourceId: view.sourceId,
        generationId: view.generationId,
        targetKey: entity.key,
        targetKind: 'entity',
      },
      projectionState: null,
      completeness,
      provenance: {
        generationId: view.generationId,
        chunkIndex: null,
        evidenceDigest: entity.anchor.evidenceDigest,
      },
    }));
    for (const relation of view.relations) {
      if (
        !entities.has(relation.sourceKey) ||
        !entities.has(relation.targetKey)
      )
        continue;
      const asserted = relation.factClass === 'user_curated';
      const factClass = asserted ? 'user_curated' : 'extracted';
      edges.push({
        id:
          asserted && relation.assertedCorrectionId
            ? assertedEdgeId(relation.assertedCorrectionId)
            : semanticRelationEdgeId(
                view.sourceId,
                view.generationId,
                relation.key,
              ),
        relation: asserted ? 'asserted' : 'semantic',
        sourceNodeId: semanticNodeId(
          view.sourceId,
          view.generationId,
          relation.sourceKey,
        ),
        targetNodeId: semanticNodeId(
          view.sourceId,
          view.generationId,
          relation.targetKey,
        ),
        directed: true,
        predicate: relation.anchor.predicate,
        factClass,
        sourceRef: this.sourceRef(view),
        permissions: graphPermissions({
          factClass,
          canWriteSource: true,
          canManageCurated: false,
          assertedCorrection: asserted,
        }),
        editTarget: {
          kind: 'semantic_correction',
          sourceId: view.sourceId,
          generationId: view.generationId,
          targetKey: relation.key,
          targetKind: 'relation',
        },
        projectionState: null,
        completeness,
        provenance: {
          generationId: view.generationId,
          chunkIndex: null,
          evidenceDigest: null,
        },
      });
    }
    return edges;
  }

  private sourceRef(view: SemanticReadView): GraphSourceRef {
    return {
      kind: 'wiki_document',
      id: view.sourceId,
      title: view.sourceTitle,
      updatedAt: view.sourceUpdatedAt.toISOString(),
    };
  }
}
