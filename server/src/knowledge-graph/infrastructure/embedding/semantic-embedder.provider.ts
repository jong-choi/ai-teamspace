import type { EmbeddingsInterface } from '@langchain/core/embeddings';

export abstract class SemanticEmbedder {
  abstract embedDocuments(
    texts: readonly string[],
    signal: AbortSignal,
  ): Promise<number[][]>;
  abstract embedQuery(text: string, signal: AbortSignal): Promise<number[]>;
  abstract asLangchainEmbeddings(): EmbeddingsInterface;
}
