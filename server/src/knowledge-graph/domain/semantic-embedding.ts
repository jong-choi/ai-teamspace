import { SemanticProviderError } from '@/knowledge-graph/domain/semantic-error';
import { semanticPipelineDescriptor } from '@/knowledge-graph/domain/semantic-pipeline';

export function assertSemanticEmbeddingInputs(texts: readonly string[]) {
  for (const text of texts) {
    if (!text.trim()) throw new SemanticProviderError('EMBEDDING_INVALID');
    if (
      Buffer.byteLength(text, 'utf8') >
      semanticPipelineDescriptor.embedding.maxInputBytes
    )
      throw new SemanticProviderError('SEMANTIC_SOURCE_TOO_LARGE');
  }
}

export function assertSemanticEmbeddingBatch(
  vectors: readonly number[][],
  expected: number,
) {
  if (
    vectors.length !== expected ||
    vectors.some(
      (vector) =>
        vector.length !== semanticPipelineDescriptor.embedding.dimensions ||
        vector.some((value) => !Number.isFinite(value)) ||
        vector.reduce((sum, value) => sum + value * value, 0) <= 1e-12,
    )
  ) {
    throw new SemanticProviderError('EMBEDDING_INVALID');
  }
}
