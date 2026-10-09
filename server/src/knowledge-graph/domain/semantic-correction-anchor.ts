import { semanticOntology } from '@/knowledge-graph/domain/semantic-pipeline';

import { z } from 'zod';

export const SemanticEntityAnchorSchema = z
  .object({
    v: z.literal(1),
    entityType: z.enum(semanticOntology.allowedNodes),
    normalizedName: z.string().min(1).max(200),
    evidenceDigest: z.string().regex(/^[0-9a-f]{64}$/),
    occurrence: z.number().int().min(1).max(1000),
    extractorFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const SemanticRelationAnchorSchema = z
  .object({
    v: z.literal(1),
    source: SemanticEntityAnchorSchema,
    target: SemanticEntityAnchorSchema,
    predicate: z.enum(semanticOntology.allowedRelationships),
  })
  .strict();

export const SemanticCorrectionAnchorSchema = z.union([
  SemanticEntityAnchorSchema,
  SemanticRelationAnchorSchema,
]);
export const SemanticCorrectionValueSchema = z.union([
  z.object({ label: z.string().trim().min(1).max(200) }).strict(),
  z
    .object({
      predicate: z.enum(semanticOntology.allowedRelationships),
      source: SemanticEntityAnchorSchema,
      target: SemanticEntityAnchorSchema,
    })
    .strict(),
]);

export type SemanticCorrectionAnchor = z.infer<
  typeof SemanticCorrectionAnchorSchema
>;
export type SemanticCorrectionValue = z.infer<
  typeof SemanticCorrectionValueSchema
>;
