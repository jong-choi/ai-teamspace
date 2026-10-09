import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import {
  SemanticCorrectionAnchorSchema,
  SemanticCorrectionValueSchema,
  SemanticEntityAnchorSchema,
  SemanticRelationAnchorSchema,
} from '@/knowledge-graph/domain/semantic-correction-anchor';
import {
  SemanticCorrectionSelectSchema,
  SemanticCorrectionSourceSelectSchema,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/semantic-correction.zod';

import { z } from 'zod';

export const SemanticCorrectionSchema = SemanticCorrectionSelectSchema;
export const SemanticCorrectionSourceSchema =
  SemanticCorrectionSourceSelectSchema;
export const SemanticCorrectionMatchStateSchema = z.enum([
  'matched',
  'pending_review',
  'ambiguous_review',
]);
export const SemanticCorrectionTargetSchema = z.object({
  key: z.string().regex(/^[0-9a-f]{64}$/),
  anchor: SemanticEntityAnchorSchema,
  localId: z.string().min(1).max(200),
});
export const SemanticCorrectionRelationTargetSchema = z.object({
  key: z.string().regex(/^[0-9a-f]{64}$/),
  sourceKey: SemanticCorrectionTargetSchema.shape.key,
  targetKey: SemanticCorrectionTargetSchema.shape.key,
  anchor: SemanticRelationAnchorSchema,
});
export const SemanticCorrectionGraphSchema = z.object({
  entities: z.array(SemanticCorrectionTargetSchema),
  relations: z.array(SemanticCorrectionRelationTargetSchema),
});
export const SemanticCorrectionCreateSchema =
  SemanticCorrectionSelectSchema.pick({
    organizationId: true,
    sourceKind: true,
    sourceId: true,
    correctionTargetId: true,
    targetKind: true,
    action: true,
    anchor: true,
    value: true,
    createdByUserId: true,
  });
export const SemanticCorrectionMatchReportSchema = z.object({
  correctionId: SemanticCorrectionSelectSchema.shape.id,
  state: SemanticCorrectionMatchStateSchema,
});

export type SemanticCorrection = z.infer<typeof SemanticCorrectionSchema>;
export type SemanticCorrectionSource = z.infer<
  typeof SemanticCorrectionSourceSchema
>;
export type SemanticCorrectionTarget = z.infer<
  typeof SemanticCorrectionTargetSchema
>;
export type SemanticCorrectionRelationTarget = z.infer<
  typeof SemanticCorrectionRelationTargetSchema
>;
export type SemanticCorrectionGraph = z.infer<
  typeof SemanticCorrectionGraphSchema
>;
export type SemanticCorrectionCreate = z.infer<
  typeof SemanticCorrectionCreateSchema
>;
export type SemanticCorrectionMatchReport = z.infer<
  typeof SemanticCorrectionMatchReportSchema
>;

function sameEntityAnchor(
  left: z.infer<typeof SemanticEntityAnchorSchema>,
  right: z.infer<typeof SemanticEntityAnchorSchema>,
) {
  return (
    left.v === right.v &&
    left.entityType === right.entityType &&
    left.normalizedName === right.normalizedName &&
    left.evidenceDigest === right.evidenceDigest &&
    left.occurrence === right.occurrence &&
    left.extractorFingerprint === right.extractorFingerprint
  );
}

export function matchSemanticCorrection(
  anchor: z.infer<typeof SemanticCorrectionAnchorSchema>,
  graph: SemanticCorrectionGraph,
) {
  if ('entityType' in anchor) {
    const matches = graph.entities.filter((entity) =>
      sameEntityAnchor(anchor, entity.anchor),
    );
    return {
      state:
        matches.length === 0
          ? ('pending_review' as const)
          : matches.length === 1
            ? ('matched' as const)
            : ('ambiguous_review' as const),
      targetKey: matches.length === 1 ? matches[0]?.key : undefined,
    };
  }
  const sources = graph.entities.filter((entity) =>
    sameEntityAnchor(anchor.source, entity.anchor),
  );
  const targets = graph.entities.filter((entity) =>
    sameEntityAnchor(anchor.target, entity.anchor),
  );
  if (sources.length === 0 || targets.length === 0)
    return { state: 'pending_review' as const };
  if (sources.length !== 1 || targets.length !== 1)
    return { state: 'ambiguous_review' as const };
  const matches = graph.relations.filter(
    (relation) =>
      relation.sourceKey === sources[0]?.key &&
      relation.targetKey === targets[0]?.key &&
      relation.anchor.predicate === anchor.predicate,
  );
  return {
    state:
      matches.length === 0
        ? ('pending_review' as const)
        : matches.length === 1
          ? ('matched' as const)
          : ('ambiguous_review' as const),
    targetKey: matches.length === 1 ? matches[0]?.key : undefined,
  };
}

export function semanticCorrectionTargetId(
  targetKind: SemanticCorrection['targetKind'],
  anchor: z.infer<typeof SemanticCorrectionAnchorSchema>,
) {
  return digestGraphJson(['semantic-correction-target', targetKind, anchor]);
}

export function matchSemanticCorrectionRecord(
  correction: SemanticCorrection,
  graph: SemanticCorrectionGraph,
) {
  if (correction.action !== 'asserted_relation')
    return matchSemanticCorrection(correction.anchor, graph);
  const value = SemanticCorrectionValueSchema.parse(correction.value);
  if (!('predicate' in value)) return { state: 'pending_review' as const };
  const source = matchSemanticCorrection(value.source, graph);
  const target = matchSemanticCorrection(value.target, graph);
  if (
    source.state === 'ambiguous_review' ||
    target.state === 'ambiguous_review'
  )
    return { state: 'ambiguous_review' as const };
  if (source.state !== 'matched' || target.state !== 'matched')
    return { state: 'pending_review' as const };
  return { state: 'matched' as const };
}

export function applySemanticCorrections(
  graphInput: SemanticCorrectionGraph,
  correctionInput: readonly SemanticCorrection[],
) {
  const graph = SemanticCorrectionGraphSchema.parse(graphInput);
  const corrections = correctionInput
    .map((correction) => SemanticCorrectionSchema.parse(correction))
    .sort(
      (left, right) =>
        left.createdRevision - right.createdRevision ||
        left.id.localeCompare(right.id),
    );
  const suppressedEntities = new Set<string>();
  const suppressedRelations = new Set<string>();
  const labels = new Map<string, string>();
  for (const correction of corrections) {
    if (correction.status !== 'active') continue;
    const match = matchSemanticCorrection(correction.anchor, graph);
    if (match.state !== 'matched' || !match.targetKey) continue;
    if (correction.action === 'suppress') {
      (correction.targetKind === 'entity'
        ? suppressedEntities
        : suppressedRelations
      ).add(match.targetKey);
    } else if (correction.action === 'label_override') {
      const value = SemanticCorrectionValueSchema.parse(correction.value);
      if ('label' in value) labels.set(match.targetKey, value.label);
    }
  }
  const entities = graph.entities
    .filter((entity) => !suppressedEntities.has(entity.key))
    .map((entity) => ({
      ...entity,
      displayName: labels.get(entity.key) ?? entity.localId,
      factClass: 'extracted' as const,
    }));
  const visibleEntityKeys = new Set(entities.map((entity) => entity.key));
  const relations: Array<
    (typeof graph.relations)[number] & {
      factClass: 'extracted' | 'user_curated';
    }
  > = graph.relations
    .filter(
      (relation) =>
        !suppressedRelations.has(relation.key) &&
        visibleEntityKeys.has(relation.sourceKey) &&
        visibleEntityKeys.has(relation.targetKey),
    )
    .map((relation) => ({ ...relation, factClass: 'extracted' as const }));
  for (const correction of corrections) {
    if (
      correction.status !== 'active' ||
      correction.action !== 'asserted_relation'
    )
      continue;
    const value = SemanticCorrectionValueSchema.parse(correction.value);
    if (!('predicate' in value)) continue;
    const source = matchSemanticCorrection(value.source, graph);
    const target = matchSemanticCorrection(value.target, graph);
    if (
      source.state !== 'matched' ||
      target.state !== 'matched' ||
      !source.targetKey ||
      !target.targetKey ||
      !visibleEntityKeys.has(source.targetKey) ||
      !visibleEntityKeys.has(target.targetKey)
    )
      continue;
    relations.push({
      key: digestGraphJson([
        'semantic-asserted-relation',
        correction.id,
        source.targetKey,
        value.predicate,
        target.targetKey,
      ]),
      sourceKey: source.targetKey,
      targetKey: target.targetKey,
      anchor: {
        v: 1,
        source: value.source,
        target: value.target,
        predicate: value.predicate,
      },
      factClass: 'user_curated' as const,
    });
  }
  return { entities, relations };
}
