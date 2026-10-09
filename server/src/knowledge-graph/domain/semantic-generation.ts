import type { GraphDocument } from '@repo/knowledge-graph';
import { assertSemanticEmbeddingInputs } from '@/knowledge-graph/domain/semantic-embedding';
import {
  SemanticActivationSchema,
  SemanticSourceScopeSchema,
} from '@/outbox/domain/semantic-source';

import { z } from 'zod';

export const SemanticGenerationContextSchema = z.object({
  scope: SemanticSourceScopeSchema,
  generationId: SemanticActivationSchema.shape.activeGenerationId,
  signature: SemanticActivationSchema.shape.indexedSignature,
  fingerprint: SemanticActivationSchema.shape.indexedFingerprint,
  sourceUpdatedAt: SemanticActivationSchema.shape.indexedSourceUpdatedAt,
  createdAt: z.date(),
});

export type SemanticGenerationContext = z.infer<
  typeof SemanticGenerationContextSchema
>;
export type SemanticStageInput = SemanticGenerationContext & {
  chunks: readonly string[];
  vectors: readonly number[][];
  graphs: readonly GraphDocument[];
};

export function semanticEmbeddingText(title: string, chunk: string) {
  const text = `title: ${title.trim() || 'none'} | text: ${chunk}`;
  assertSemanticEmbeddingInputs([text]);
  return text;
}
