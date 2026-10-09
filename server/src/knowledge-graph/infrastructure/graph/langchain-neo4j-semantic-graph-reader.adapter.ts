import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import {
  SemanticCorrectionGraphSchema,
  SemanticCorrectionRelationTargetSchema,
  SemanticCorrectionTargetSchema,
} from '@/knowledge-graph/domain/semantic-correction';
import { SemanticProviderError } from '@/knowledge-graph/domain/semantic-error';
import { SemanticGraphReader } from '@/knowledge-graph/infrastructure/graph/semantic-graph-reader.provider';
import {
  READ_SEMANTIC_CORRECTION_ENTITIES,
  READ_SEMANTIC_CORRECTION_RELATIONS,
} from '@/knowledge-graph/semantic-graph-queries';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

@Injectable()
export class LangchainNeo4jSemanticGraphReaderAdapter
  extends SemanticGraphReader
  implements OnApplicationShutdown
{
  private connection: Promise<
    Awaited<ReturnType<typeof createNeo4jGraph>>
  > | null = null;

  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
  ) {
    super();
  }

  async readGeneration(scope: SemanticSourceScope, generationId: string) {
    try {
      const graph = await this.getGraph();
      const parameters = {
        organizationId: scope.organizationId,
        sourceKind: scope.aggregateKind,
        sourceId: scope.aggregateId,
        generationId,
      };
      const entityRows = await graph.query(
        READ_SEMANTIC_CORRECTION_ENTITIES,
        parameters,
      );
      const entities = SemanticCorrectionTargetSchema.array().parse(
        entityRows.map((row) => ({
          key: row.key,
          localId: row.localId,
          anchor: {
            v: 1,
            entityType: row.entityType,
            normalizedName: row.normalizedName,
            evidenceDigest: row.evidenceDigest,
            occurrence: Number(row.occurrence),
            extractorFingerprint: row.extractorFingerprint,
          },
        })),
      );
      const byKey = new Map(entities.map((entity) => [entity.key, entity]));
      const relationRows = await graph.query(
        READ_SEMANTIC_CORRECTION_RELATIONS,
        parameters,
      );
      const relations = SemanticCorrectionRelationTargetSchema.array().parse(
        relationRows.map((row) => ({
          key: row.key,
          sourceKey: row.sourceKey,
          targetKey: row.targetKey,
          anchor: {
            v: 1,
            source: byKey.get(String(row.sourceKey))?.anchor,
            target: byKey.get(String(row.targetKey))?.anchor,
            predicate: row.predicate,
          },
        })),
      );
      return SemanticCorrectionGraphSchema.parse({ entities, relations });
    } catch (error) {
      if (error instanceof SemanticProviderError) throw error;
      throw new SemanticProviderError('GRAPH_STORE_UNAVAILABLE');
    }
  }

  private async getGraph() {
    this.connection ??= (async () => {
      if (!this.config.url || !this.config.username || !this.config.password)
        throw new SemanticProviderError('GRAPH_STORE_UNAVAILABLE');
      return createNeo4jGraph({
        url: this.config.url,
        username: this.config.username,
        password: this.config.password,
        database: this.config.database,
        timeoutMs: 20_000,
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
    if (connection) await (await connection).close();
  }
}
