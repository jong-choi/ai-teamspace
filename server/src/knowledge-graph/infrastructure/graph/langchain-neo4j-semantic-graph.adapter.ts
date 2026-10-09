import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { createNeo4jGraph, Neo4jVectorStore } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { assertSemanticEmbeddingBatch } from '@/knowledge-graph/domain/semantic-embedding';
import { SemanticProviderError } from '@/knowledge-graph/domain/semantic-error';
import type { SemanticStageInput } from '@/knowledge-graph/domain/semantic-generation';
import {
  normalizeSemanticGraph,
  semanticChunkKey,
} from '@/knowledge-graph/domain/semantic-graph-normalizer';
import { semanticOntology } from '@/knowledge-graph/domain/semantic-pipeline';
import { semanticTextHash } from '@/knowledge-graph/domain/semantic-source-signature';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { SemanticGraphStore } from '@/knowledge-graph/infrastructure/graph/semantic-graph-store.provider';
import {
  READ_SEMANTIC_VECTOR_INDEX,
  SemanticVectorIndexSchema,
} from '@/knowledge-graph/infrastructure/graph/semantic-vector-index';
import {
  deleteSemanticNodesQuery,
  SEMANTIC_GRAPH_INITIALIZATION,
  STAGE_SEMANTIC_ENTITIES,
  STAGE_SEMANTIC_RELATIONS,
} from '@/knowledge-graph/semantic-graph-queries';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

import { Document } from '@langchain/core/documents';
import { z } from 'zod';

const countSchema = z.coerce.number().int().nonnegative();

@Injectable()
export class LangchainNeo4jSemanticGraphAdapter
  extends SemanticGraphStore
  implements OnApplicationShutdown
{
  private connection: Promise<
    Awaited<ReturnType<typeof createNeo4jGraph>>
  > | null = null;
  private vectors: Promise<Neo4jVectorStore> | null = null;
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
    private readonly embedder: SemanticEmbedder,
  ) {
    super();
  }

  async stageGeneration(input: SemanticStageInput) {
    assertSemanticEmbeddingBatch(input.vectors, input.chunks.length);
    if (input.graphs.length !== input.chunks.length)
      throw new SemanticProviderError('EXTRACTION_INVALID_RESPONSE');
    const occurrences = new Map<string, number>();
    const normalized = input.graphs.map((graph, index) =>
      normalizeSemanticGraph(
        graph,
        input.chunks[index],
        index,
        input,
        occurrences,
      ),
    );
    const parameters = {
      ...this.scopeParameters(input.scope),
      generationId: input.generationId,
      fingerprint: input.fingerprint,
      createdAt: input.createdAt.toISOString(),
    };
    try {
      const graph = await this.getGraph();
      const store = await this.getVectors();
      await store.addVectors(
        [...input.vectors],
        input.chunks.map((text) => new Document({ pageContent: text })),
        input.chunks.map((text, index) => ({
          ...parameters,
          chunkIndex: index,
          sourceSignature: input.signature,
          sourceUpdatedAt: input.sourceUpdatedAt.toISOString(),
          embeddingSpace: input.fingerprint,
          textHash: semanticTextHash(text),
          ontologyVersion: semanticOntology.version,
          factClass: 'extracted',
        })),
        input.chunks.map((_, index) => semanticChunkKey(input, index)),
      );
      const entities = normalized.flatMap((row) => row.entities);
      const relations = normalized.flatMap((row) => row.relations);
      const entityResult = await graph.query(STAGE_SEMANTIC_ENTITIES, {
        ...parameters,
        entities,
      });
      if (countSchema.parse(entityResult[0]?.written) !== entities.length)
        throw new Error('SEMANTIC_ENTITIES_PARTIAL');
      const relationResult = await graph.query(STAGE_SEMANTIC_RELATIONS, {
        ...parameters,
        relations,
      });
      if (countSchema.parse(relationResult[0]?.written) !== relations.length)
        throw new Error('SEMANTIC_RELATIONS_PARTIAL');
    } catch (error) {
      if (error instanceof SemanticProviderError) throw error;
      throw new SemanticProviderError('GRAPH_STORE_UNAVAILABLE');
    }
  }

  async deleteGeneration(scope: SemanticSourceScope, generationId: string) {
    await this.deleteNodes(
      { ...this.scopeParameters(scope), generationId },
      true,
    );
  }
  async deleteInactiveGenerations(
    scope: SemanticSourceScope,
    keepGenerationId: string | null,
    olderThan: Date,
  ) {
    return this.deleteNodes(
      {
        ...this.scopeParameters(scope),
        keep: keepGenerationId,
        olderThan: olderThan.toISOString(),
      },
      false,
    );
  }
  private async deleteNodes(
    parameters: Record<string, string | null>,
    oneGeneration: boolean,
  ) {
    try {
      const graph = await this.getGraph();
      let rounds = 0;
      for (const label of ['KGSemanticChunk', 'KGSemanticEntity'] as const) {
        let complete = false;
        while (rounds < 100) {
          rounds++;
          const rows = await graph.query(
            deleteSemanticNodesQuery(label, oneGeneration),
            parameters,
          );
          if (countSchema.parse(rows[0]?.deleted) < 1000) {
            complete = true;
            break;
          }
        }
        if (!complete) return false;
      }
      if (!oneGeneration) {
        for (const label of ['KGSemanticChunk', 'KGSemanticEntity'] as const) {
          const remaining = await graph.query(
            `MATCH (n:${label}) WHERE n.organizationId=$organizationId AND n.sourceKind=$sourceKind AND n.sourceId=$sourceId AND ($keep IS NULL OR n.generationId<>$keep) RETURN count(n) AS remaining`,
            parameters,
          );
          if (countSchema.parse(remaining[0]?.remaining) > 0) return false;
        }
      }
      return true;
    } catch {
      throw new SemanticProviderError('GRAPH_STORE_UNAVAILABLE');
    }
  }
  private scopeParameters(scope: SemanticSourceScope) {
    return {
      organizationId: scope.organizationId,
      sourceKind: scope.aggregateKind,
      sourceId: scope.aggregateId,
    };
  }
  private async getGraph() {
    this.connection ??= (async () => {
      if (!this.config.url || !this.config.username || !this.config.password)
        throw new SemanticProviderError('GRAPH_STORE_UNAVAILABLE');
      const graph = await createNeo4jGraph({
        url: this.config.url,
        username: this.config.username,
        password: this.config.password,
        database: this.config.database,
        timeoutMs: 20_000,
      });
      try {
        for (const query of SEMANTIC_GRAPH_INITIALIZATION)
          await graph.query(query);
        return graph;
      } catch (error) {
        await graph.close();
        throw error;
      }
    })();
    try {
      return await this.connection;
    } catch (error) {
      this.connection = null;
      throw error;
    }
  }
  private async getVectors() {
    const graph = await this.getGraph();
    this.vectors ??= (async () => {
      if (!this.config.url || !this.config.username || !this.config.password)
        throw new SemanticProviderError('GRAPH_STORE_UNAVAILABLE');
      SemanticVectorIndexSchema.parse(
        await graph.query(READ_SEMANTIC_VECTOR_INDEX),
      );
      return Neo4jVectorStore.fromExistingIndex(
        this.embedder.asLangchainEmbeddings(),
        {
          url: this.config.url,
          username: this.config.username,
          password: this.config.password,
          database: this.config.database,
          indexName: 'kg_semantic_chunk_embedding_v1',
          nodeLabel: 'KGSemanticChunk',
          textNodeProperty: 'text',
          embeddingNodeProperty: 'embedding',
        },
      );
    })();
    try {
      return await this.vectors;
    } catch (error) {
      this.vectors = null;
      throw error;
    }
  }
  async onApplicationShutdown() {
    const resources = await Promise.allSettled([this.vectors, this.connection]);
    this.vectors = null;
    this.connection = null;
    for (const result of resources)
      if (result.status === 'fulfilled' && result.value)
        await result.value.close();
  }
}
