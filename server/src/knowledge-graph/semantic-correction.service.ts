import { Injectable } from '@nestjs/common';

import {
  applySemanticCorrections,
  matchSemanticCorrection,
  matchSemanticCorrectionRecord,
  semanticCorrectionTargetId,
} from '@/knowledge-graph/domain/semantic-correction';
import {
  SemanticCorrectionValueSchema,
  SemanticRelationAnchorSchema,
} from '@/knowledge-graph/domain/semantic-correction-anchor';
import { SemanticGraphReader } from '@/knowledge-graph/infrastructure/graph/semantic-graph-reader.provider';
import { SemanticCorrectionRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-correction.repository';
import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

@Injectable()
export class SemanticCorrectionService {
  constructor(
    private readonly state: SemanticSourceStateRepository,
    private readonly graphReader: SemanticGraphReader,
    private readonly corrections: SemanticCorrectionRepository,
  ) {}

  async createLabelOverride(
    scope: SemanticSourceScope,
    targetEntityKey: string,
    label: string,
    actorUserId: string,
  ) {
    const active = await this.activeGraph(scope);
    if (!active) return { outcome: 'not_found' as const };
    const target = active.graph.entities.find(
      (entity) => entity.key === targetEntityKey,
    );
    if (!target) return { outcome: 'not_found' as const };
    const match = matchSemanticCorrection(target.anchor, active.graph);
    if (match.state !== 'matched') return { outcome: match.state };
    const stored = await this.corrections.create({
      organizationId: scope.organizationId,
      sourceKind: scope.aggregateKind,
      sourceId: scope.aggregateId,
      correctionTargetId: semanticCorrectionTargetId('entity', target.anchor),
      targetKind: 'entity',
      action: 'label_override',
      anchor: target.anchor,
      value: SemanticCorrectionValueSchema.parse({ label }),
      createdByUserId: actorUserId,
    });
    return { outcome: 'created' as const, ...stored };
  }

  async createSuppress(
    scope: SemanticSourceScope,
    targetKind: 'entity' | 'relation',
    targetKey: string,
    actorUserId: string,
  ) {
    const active = await this.activeGraph(scope);
    if (!active) return { outcome: 'not_found' as const };
    const target =
      targetKind === 'entity'
        ? active.graph.entities.find((entity) => entity.key === targetKey)
        : active.graph.relations.find((relation) => relation.key === targetKey);
    if (!target) return { outcome: 'not_found' as const };
    const match = matchSemanticCorrection(target.anchor, active.graph);
    if (match.state !== 'matched') return { outcome: match.state };
    const stored = await this.corrections.create({
      organizationId: scope.organizationId,
      sourceKind: scope.aggregateKind,
      sourceId: scope.aggregateId,
      correctionTargetId: semanticCorrectionTargetId(targetKind, target.anchor),
      targetKind,
      action: 'suppress',
      anchor: target.anchor,
      value: null,
      createdByUserId: actorUserId,
    });
    return { outcome: 'created' as const, ...stored };
  }

  async correctPredicate(
    scope: SemanticSourceScope,
    relationKey: string,
    predicateInput: string,
    actorUserId: string,
  ) {
    const active = await this.activeGraph(scope);
    if (!active) return { outcome: 'not_found' as const };
    const relation = active.graph.relations.find(
      (candidate) => candidate.key === relationKey,
    );
    if (!relation) return { outcome: 'not_found' as const };
    const match = matchSemanticCorrection(relation.anchor, active.graph);
    if (match.state !== 'matched') return { outcome: match.state };
    const predicate =
      SemanticRelationAnchorSchema.shape.predicate.parse(predicateInput);
    const assertedAnchor = {
      ...relation.anchor,
      predicate,
    };
    const stored = await this.corrections.createLinkedPair(
      {
        organizationId: scope.organizationId,
        sourceKind: scope.aggregateKind,
        sourceId: scope.aggregateId,
        correctionTargetId: semanticCorrectionTargetId(
          'relation',
          relation.anchor,
        ),
        targetKind: 'relation',
        action: 'suppress',
        anchor: relation.anchor,
        value: null,
        createdByUserId: actorUserId,
      },
      {
        organizationId: scope.organizationId,
        sourceKind: scope.aggregateKind,
        sourceId: scope.aggregateId,
        correctionTargetId: semanticCorrectionTargetId(
          'relation',
          assertedAnchor,
        ),
        targetKind: 'relation',
        action: 'asserted_relation',
        anchor: assertedAnchor,
        value: SemanticCorrectionValueSchema.parse({
          predicate,
          source: relation.anchor.source,
          target: relation.anchor.target,
        }),
        createdByUserId: actorUserId,
      },
    );
    return { outcome: 'created' as const, ...stored };
  }

  async createLabelOverrideInCurrentTransaction(
    scope: SemanticSourceScope,
    expectedGenerationId: string,
    targetEntityKey: string,
    label: string,
    actorUserId: string,
  ) {
    const active = await this.expectedGraph(scope, expectedGenerationId);
    if (!active) return { outcome: 'view_changed' as const };
    const target = active.entities.find(
      (entity) => entity.key === targetEntityKey,
    );
    if (!target) return { outcome: 'ambiguous_review' as const };
    const match = matchSemanticCorrection(target.anchor, active);
    if (match.state !== 'matched')
      return { outcome: 'ambiguous_review' as const };
    const stored = await this.corrections.createInCurrentTransaction({
      organizationId: scope.organizationId,
      sourceKind: scope.aggregateKind,
      sourceId: scope.aggregateId,
      correctionTargetId: semanticCorrectionTargetId('entity', target.anchor),
      targetKind: 'entity',
      action: 'label_override',
      anchor: target.anchor,
      value: SemanticCorrectionValueSchema.parse({ label }),
      createdByUserId: actorUserId,
    });
    if (!(await this.isActiveGeneration(scope, expectedGenerationId)))
      return { outcome: 'view_changed' as const };
    return { outcome: 'created' as const, ...stored };
  }

  async createSuppressInCurrentTransaction(
    scope: SemanticSourceScope,
    expectedGenerationId: string,
    targetKind: 'entity' | 'relation',
    targetKey: string,
    actorUserId: string,
  ) {
    const active = await this.expectedGraph(scope, expectedGenerationId);
    if (!active) return { outcome: 'view_changed' as const };
    const target =
      targetKind === 'entity'
        ? active.entities.find((entity) => entity.key === targetKey)
        : active.relations.find((relation) => relation.key === targetKey);
    if (!target) return { outcome: 'ambiguous_review' as const };
    const match = matchSemanticCorrection(target.anchor, active);
    if (match.state !== 'matched')
      return { outcome: 'ambiguous_review' as const };
    const stored = await this.corrections.createInCurrentTransaction({
      organizationId: scope.organizationId,
      sourceKind: scope.aggregateKind,
      sourceId: scope.aggregateId,
      correctionTargetId: semanticCorrectionTargetId(targetKind, target.anchor),
      targetKind,
      action: 'suppress',
      anchor: target.anchor,
      value: null,
      createdByUserId: actorUserId,
    });
    if (!(await this.isActiveGeneration(scope, expectedGenerationId)))
      return { outcome: 'view_changed' as const };
    return { outcome: 'created' as const, ...stored };
  }

  async correctPredicateInCurrentTransaction(
    scope: SemanticSourceScope,
    expectedGenerationId: string,
    relationKey: string,
    predicateInput: string,
    actorUserId: string,
  ) {
    const active = await this.expectedGraph(scope, expectedGenerationId);
    if (!active) return { outcome: 'view_changed' as const };
    const relation = active.relations.find(
      (candidate) => candidate.key === relationKey,
    );
    if (!relation) return { outcome: 'ambiguous_review' as const };
    const match = matchSemanticCorrection(relation.anchor, active);
    if (match.state !== 'matched')
      return { outcome: 'ambiguous_review' as const };
    const predicate =
      SemanticRelationAnchorSchema.shape.predicate.parse(predicateInput);
    const assertedAnchor = { ...relation.anchor, predicate };
    const stored = await this.corrections.createLinkedPairInCurrentTransaction(
      {
        organizationId: scope.organizationId,
        sourceKind: scope.aggregateKind,
        sourceId: scope.aggregateId,
        correctionTargetId: semanticCorrectionTargetId(
          'relation',
          relation.anchor,
        ),
        targetKind: 'relation',
        action: 'suppress',
        anchor: relation.anchor,
        value: null,
        createdByUserId: actorUserId,
      },
      {
        organizationId: scope.organizationId,
        sourceKind: scope.aggregateKind,
        sourceId: scope.aggregateId,
        correctionTargetId: semanticCorrectionTargetId(
          'relation',
          assertedAnchor,
        ),
        targetKind: 'relation',
        action: 'asserted_relation',
        anchor: assertedAnchor,
        value: SemanticCorrectionValueSchema.parse({
          predicate,
          source: relation.anchor.source,
          target: relation.anchor.target,
        }),
        createdByUserId: actorUserId,
      },
    );
    if (!(await this.isActiveGeneration(scope, expectedGenerationId)))
      return { outcome: 'view_changed' as const };
    return { outcome: 'created' as const, ...stored };
  }

  findById(organizationId: string, correctionId: string) {
    return this.corrections.findById(organizationId, correctionId);
  }

  cancelByIdInCurrentTransaction(
    organizationId: string,
    correctionId: string,
    actorUserId: string,
  ) {
    return this.corrections.cancelByIdInCurrentTransaction(
      organizationId,
      correctionId,
      actorUserId,
    );
  }

  replaceLabelOverrideByIdInCurrentTransaction(
    organizationId: string,
    correctionId: string,
    label: string,
    actorUserId: string,
  ) {
    return this.corrections.replaceLabelOverrideByIdInCurrentTransaction(
      organizationId,
      correctionId,
      label,
      actorUserId,
    );
  }

  async isActiveGeneration(
    scope: SemanticSourceScope,
    expectedGenerationId: string,
  ) {
    const current = await this.state.current(scope);
    return Boolean(
      current &&
      !current.version.deleted &&
      current.state?.activeGenerationId === expectedGenerationId,
    );
  }

  cancel(
    scope: SemanticSourceScope,
    correctionId: string,
    actorUserId: string,
  ) {
    return this.corrections.cancel(scope, correctionId, actorUserId);
  }

  listActive(scope: SemanticSourceScope) {
    return this.corrections.listActive(scope);
  }

  async effectiveGraph(scope: SemanticSourceScope) {
    const active = await this.activeGraph(scope);
    if (!active) return null;
    const current = await this.corrections.listActive(scope);
    return {
      generationId: active.generationId,
      editRevision: current.editRevision,
      ...applySemanticCorrections(active.graph, current.corrections),
    };
  }

  async reportMatches(scope: SemanticSourceScope, generationId: string) {
    const current = await this.corrections.listActive(scope);
    if (current.corrections.length === 0) return;
    const graph = await this.graphReader.readGeneration(scope, generationId);
    await this.corrections.reportMatches(
      scope,
      generationId,
      current.corrections.map((correction) => ({
        correctionId: correction.id,
        state: matchSemanticCorrectionRecord(correction, graph).state,
      })),
    );
  }

  private async expectedGraph(
    scope: SemanticSourceScope,
    expectedGenerationId: string,
  ) {
    if (!(await this.isActiveGeneration(scope, expectedGenerationId)))
      return null;
    return this.graphReader.readGeneration(scope, expectedGenerationId);
  }

  private async activeGraph(scope: SemanticSourceScope) {
    const current = await this.state.current(scope);
    const generationId = current?.state?.activeGenerationId;
    if (!current || current.version.deleted || !generationId) return null;
    return {
      generationId,
      graph: await this.graphReader.readGeneration(scope, generationId),
    };
  }
}
