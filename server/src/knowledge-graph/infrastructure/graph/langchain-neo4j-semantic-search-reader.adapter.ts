import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphSemanticSearchUnavailableError } from '@/knowledge-graph/domain/graph-search.error';
import { assertSemanticSearchVectorIndexReady } from '@/knowledge-graph/domain/graph-semantic-search-readiness';
import {
  KnowledgeGraphSemanticSearchReader,
  type SemanticApproximateInput,
  SemanticChunkHitSchema,
  type SemanticExactInput,
} from '@/knowledge-graph/infrastructure/graph/knowledge-graph-semantic-search-reader.provider';
import {
  SEARCH_SEMANTIC_APPROXIMATE,
  SEARCH_SEMANTIC_EXACT,
  SEMANTIC_CHUNK_VECTOR_INDEX,
  SHOW_SEMANTIC_VECTOR_INDEX,
} from '@/knowledge-graph/knowledge-graph-search-queries';

@Injectable()
export class LangchainNeo4jSemanticSearchReaderAdapter
  extends KnowledgeGraphSemanticSearchReader
  implements OnApplicationShutdown
{
  private connection: Promise<
    Awaited<ReturnType<typeof createNeo4jGraph>>
  > | null = null;
  private vectorIndexReady: Promise<void> | null = null;

  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
  ) {
    super();
  }

  async semanticExact(input: SemanticExactInput) {
    if (input.scopes.length === 0) return [];
    await this.ensureVectorIndexReady();
    const rows = await this.run(SEARCH_SEMANTIC_EXACT, {
      organizationId: input.organizationId,
      fingerprint: input.fingerprint,
      scopes: input.scopes,
      vector: input.vector,
      candidateLimit: input.candidateLimit,
    });
    return SemanticChunkHitSchema.array().parse(rows);
  }

  async semanticApproximate(input: SemanticApproximateInput) {
    await this.ensureVectorIndexReady();
    const rows = await this.run(SEARCH_SEMANTIC_APPROXIMATE, {
      indexName: SEMANTIC_CHUNK_VECTOR_INDEX,
      organizationId: input.organizationId,
      fingerprint: input.fingerprint,
      vector: input.vector,
      k: input.k,
    });
    return SemanticChunkHitSchema.array().parse(rows);
  }

  private async run(query: string, parameters: Record<string, unknown>) {
    try {
      const graph = await this.getGraph();
      return await graph.query(query, parameters);
    } catch (error) {
      if (error instanceof KnowledgeGraphSemanticSearchUnavailableError)
        throw error;
      throw new KnowledgeGraphSemanticSearchUnavailableError(
        'KG_GRAPH_UNAVAILABLE',
      );
    }
  }

  private async ensureVectorIndexReady() {
    this.vectorIndexReady ??= (async () => {
      const rows = await this.run(SHOW_SEMANTIC_VECTOR_INDEX, {
        indexName: SEMANTIC_CHUNK_VECTOR_INDEX,
      });
      assertSemanticSearchVectorIndexReady(rows);
    })();
    await this.vectorIndexReady;
  }

  private async getGraph() {
    this.connection ??= (async () => {
      if (!this.config.url || !this.config.username || !this.config.password)
        throw new KnowledgeGraphSemanticSearchUnavailableError(
          'KG_GRAPH_UNAVAILABLE',
        );
      return createNeo4jGraph({
        url: this.config.url,
        username: this.config.username,
        password: this.config.password,
        database: this.config.database,
        timeoutMs: this.config.query.graphReadTimeoutMs,
      });
    })();
    try {
      return await this.connection;
    } catch (error) {
      this.connection = null;
      throw error;
    }
  }

  async onApplicationShutdown() {
    const connection = this.connection;
    this.connection = null;
    this.vectorIndexReady = null;
    const settled = await Promise.allSettled([connection]);
    for (const result of settled)
      if (result.status === 'fulfilled' && result.value)
        await result.value.close();
  }
}
