import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import {
  assertSemanticEmbeddingBatch,
  assertSemanticEmbeddingInputs,
} from '@/knowledge-graph/domain/semantic-embedding';
import {
  SemanticLeaseLostError,
  SemanticProviderError,
} from '@/knowledge-graph/domain/semantic-error';
import { semanticPipelineDescriptor } from '@/knowledge-graph/domain/semantic-pipeline';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { providerStatusError } from '@/knowledge-graph/infrastructure/provider-http/classified-provider-fetch';

import { ApiError, GoogleGenAI } from '@google/genai';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';

@Injectable()
export class GeminiEmbedding2Adapter extends SemanticEmbedder {
  private readonly client: GoogleGenAI;
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    config: ConfigType<typeof knowledgeGraphConfig>,
  ) {
    super();
    if (!config.semantic)
      throw new SemanticProviderError('PROVIDER_UNAUTHORIZED');
    this.client = new GoogleGenAI({
      apiKey: config.semantic.geminiApiKey,
      httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } },
    });
  }
  async embedDocuments(texts: readonly string[], signal: AbortSignal) {
    assertSemanticEmbeddingInputs(texts);
    const vectors: number[][] = [];
    for (let index = 0; index < texts.length; index += 16) {
      if (signal.aborted) throw new SemanticLeaseLostError();
      const batch = texts.slice(index, index + 16);
      if (batch.some((text) => !text.trim()))
        throw new SemanticProviderError('EMBEDDING_INVALID');
      try {
        const response = await this.client.models.embedContent({
          model: semanticPipelineDescriptor.embedding.model,
          contents: batch.map((text) => ({ parts: [{ text }] })),
          config: { outputDimensionality: 768, abortSignal: signal },
        });
        const values = (response.embeddings ?? []).map(
          (row) => row.values ?? [],
        );
        assertSemanticEmbeddingBatch(values, batch.length);
        vectors.push(...values);
      } catch (error) {
        if (signal.aborted) throw new SemanticLeaseLostError();
        if (error instanceof SemanticProviderError) throw error;
        if (error instanceof ApiError) throw providerStatusError(error.status);
        throw new SemanticProviderError(
          error instanceof Error &&
            (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? 'PROVIDER_TIMEOUT'
            : 'PROVIDER_UNAVAILABLE',
        );
      }
    }
    return vectors;
  }
  async embedQuery(text: string, signal: AbortSignal) {
    if (!text.trim()) throw new SemanticProviderError('EMBEDDING_INVALID');
    const [vector] = await this.embedDocuments(
      [`task: search result | query: ${text}`],
      signal,
    );
    if (!vector) throw new SemanticProviderError('EMBEDDING_INVALID');
    return vector;
  }
  asLangchainEmbeddings(): EmbeddingsInterface {
    return {
      embedDocuments: (texts) =>
        this.embedDocuments(texts, new AbortController().signal),
      embedQuery: (text) => this.embedQuery(text, new AbortController().signal),
    };
  }
}
