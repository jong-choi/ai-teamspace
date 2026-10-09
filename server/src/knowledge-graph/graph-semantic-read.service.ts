import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import { KnowledgeGraphViewChangedError } from '@/knowledge-graph/domain/graph-read.error';
import {
  type SemanticCorrection,
  type SemanticCorrectionGraph,
} from '@/knowledge-graph/domain/semantic-correction';
import { SemanticCorrectionValueSchema } from '@/knowledge-graph/domain/semantic-correction-anchor';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { computeSemanticSourceSignature } from '@/knowledge-graph/domain/semantic-source-signature';
import { SemanticSearchStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-search-state.repository';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';

export type SemanticReadView = {
  sourceId: string;
  sourceTitle: string;
  sourceUpdatedAt: Date;
  generationId: string;
  editRevision: number;
  entities: Array<
    SemanticCorrectionGraph['entities'][number] & {
      displayName: string;
      factClass: 'extracted';
    }
  >;
  relations: Array<
    SemanticCorrectionGraph['relations'][number] & {
      factClass: 'extracted' | 'user_curated';
      assertedCorrectionId?: string;
    }
  >;
};

@Injectable()
export class GraphSemanticReadService {
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly state: SemanticSearchStateRepository,
    private readonly snapshots: GraphSourceSnapshotProvider,
    private readonly corrections: SemanticCorrectionService,
  ) {}

  async searchableScopes(organizationId: string) {
    if (!this.config.semanticEnabled) return [];
    const rows = await this.state.listSearchableSources(
      organizationId,
      semanticPipelineFingerprint,
      this.config.searchEnnMaxSources + 1,
    );
    return rows
      .filter(
        (row) =>
          !row.deleted &&
          row.activeGenerationId &&
          row.indexedFingerprint === semanticPipelineFingerprint,
      )
      .slice(0, this.config.searchEnnMaxSources)
      .map((row) => ({
        sourceId: row.aggregateId,
        generationId: String(row.activeGenerationId),
      }));
  }

  async view(
    organizationId: string,
    sourceId: string,
    expectedGenerationId?: string,
  ): Promise<SemanticReadView | null> {
    if (!this.config.semanticEnabled) return null;
    const [current] = await this.state.currentBatch(
      organizationId,
      'wiki_document',
      [sourceId],
    );
    const generationId = current?.activeGenerationId
      ? String(current.activeGenerationId)
      : null;
    if (
      expectedGenerationId &&
      generationId &&
      generationId !== expectedGenerationId
    ) {
      throw new KnowledgeGraphViewChangedError();
    }
    if (
      !current ||
      current.deleted ||
      !generationId ||
      current.indexedFingerprint !== semanticPipelineFingerprint
    ) {
      return null;
    }
    if (expectedGenerationId && generationId !== expectedGenerationId) {
      throw new KnowledgeGraphViewChangedError();
    }

    const [semanticSource] = await this.snapshots.wikiSemantic(organizationId, [
      sourceId,
    ]);
    const [graphSource] = await this.snapshots.wikiForGraph(organizationId, [
      sourceId,
    ]);
    if (!semanticSource || !graphSource) return null;
    if (
      current.indexedSignature !==
      computeSemanticSourceSignature(semanticSource)
    ) {
      return null;
    }
    if (
      current.indexedSourceUpdatedAt &&
      current.indexedSourceUpdatedAt.valueOf() !==
        graphSource.updatedAt.valueOf()
    ) {
      return null;
    }

    const scope = {
      organizationId,
      aggregateKind: 'wiki_document' as const,
      aggregateId: sourceId,
    };
    const [effective, active] = await Promise.all([
      this.corrections.effectiveGraph(scope),
      this.corrections.listActive(scope),
    ]);
    if (!effective) return null;
    if (effective.generationId !== generationId) {
      if (expectedGenerationId) throw new KnowledgeGraphViewChangedError();
      return null;
    }

    const assertedByKey = this.assertedCorrectionsByRelationKey(
      effective,
      active.corrections,
    );
    return {
      sourceId,
      sourceTitle: graphSource.title,
      sourceUpdatedAt: graphSource.updatedAt,
      generationId,
      editRevision: effective.editRevision,
      entities: effective.entities,
      relations: effective.relations.map((relation) => ({
        ...relation,
        assertedCorrectionId: assertedByKey.get(relation.key),
      })),
    };
  }

  async views(
    organizationId: string,
    scopes: readonly { sourceId: string; generationId: string }[],
  ) {
    const results: SemanticReadView[] = [];
    for (const scope of scopes) {
      const view = await this.view(
        organizationId,
        scope.sourceId,
        scope.generationId,
      );
      if (view) results.push(view);
    }
    return results;
  }

  private assertedCorrectionsByRelationKey(
    graph: {
      entities: SemanticReadView['entities'];
      relations: Array<
        SemanticCorrectionGraph['relations'][number] & {
          factClass: 'extracted' | 'user_curated';
        }
      >;
    },
    corrections: readonly SemanticCorrection[],
  ) {
    const result = new Map<string, string>();
    for (const correction of corrections) {
      if (
        correction.status !== 'active' ||
        correction.action !== 'asserted_relation'
      ) {
        continue;
      }
      const value = SemanticCorrectionValueSchema.parse(correction.value);
      if (!('predicate' in value)) continue;
      const sourceKey = this.entityKeyForAnchor(graph.entities, value.source);
      const targetKey = this.entityKeyForAnchor(graph.entities, value.target);
      if (!sourceKey || !targetKey) continue;
      const key = digestGraphJson([
        'semantic-asserted-relation',
        correction.id,
        sourceKey,
        value.predicate,
        targetKey,
      ]);
      result.set(key, correction.id);
    }
    return result;
  }

  private entityKeyForAnchor(
    entities: SemanticReadView['entities'],
    anchor: SemanticReadView['entities'][number]['anchor'],
  ) {
    const anchorDigest = digestGraphJson(anchor);
    return entities.find(
      (entity) => digestGraphJson(entity.anchor) === anchorDigest,
    )?.key;
  }
}
