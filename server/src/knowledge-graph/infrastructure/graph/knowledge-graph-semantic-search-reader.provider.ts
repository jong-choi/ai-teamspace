import { z } from 'zod';

export const SemanticSearchScopeSchema = z
  .object({
    sourceId: z.uuid(),
    generationId: z.uuid(),
  })
  .strict();

export const SemanticChunkHitSchema = z
  .object({
    sourceId: z.uuid(),
    generationId: z.uuid(),
    chunkIndex: z.coerce.number().int().min(0),
    text: z.string(),
    score: z.coerce.number().finite(),
  })
  .strict();

export type SemanticSearchScope = z.infer<typeof SemanticSearchScopeSchema>;
export type SemanticChunkHit = z.infer<typeof SemanticChunkHitSchema>;

export interface SemanticExactInput {
  organizationId: string;
  fingerprint: string;
  scopes: readonly SemanticSearchScope[];
  vector: readonly number[];
  candidateLimit: number;
}

export interface SemanticApproximateInput {
  organizationId: string;
  fingerprint: string;
  vector: readonly number[];
  k: number;
}

export abstract class KnowledgeGraphSemanticSearchReader {
  abstract semanticExact(
    input: SemanticExactInput,
  ): Promise<SemanticChunkHit[]>;
  abstract semanticApproximate(
    input: SemanticApproximateInput,
  ): Promise<SemanticChunkHit[]>;
}
