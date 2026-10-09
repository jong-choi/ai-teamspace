import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import {
  createNeo4jGraph,
  GraphDocument,
  Node,
  Relationship,
} from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import type { SemanticStageInput } from '@/knowledge-graph/domain/semantic-generation';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { LangchainNeo4jSemanticGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-semantic-graph.adapter';

import { Document } from '@langchain/core/documents';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';

const describeWritable =
  process.env.KG_TEST_ALLOW_WRITE === '1' && process.env.NEO4J_URI
    ? describe
    : describe.skip;
jest.setTimeout(60_000);
class StorageEmbeddingFixture extends SemanticEmbedder {
  private vector() {
    return [1, ...Array.from({ length: 767 }, () => 0)];
  }
  async embedDocuments(texts: readonly string[]) {
    return texts.map(() => this.vector());
  }
  async embedQuery() {
    return this.vector();
  }
  asLangchainEmbeddings(): EmbeddingsInterface {
    return {
      embedDocuments: (texts) => this.embedDocuments(texts),
      embedQuery: () => this.embedQuery(),
    };
  }
}

describeWritable(
  '실제 CE 의미 staging의 source namespace와 GC 소유 범위',
  () => {
    const orgA = `p7-storage-a-${randomUUID()}`;
    const orgB = `p7-storage-b-${randomUUID()}`;
    const sourceId = randomUUID();
    let app: TestingModule;
    let store: LangchainNeo4jSemanticGraphAdapter;
    let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
    const inputs: SemanticStageInput[] = [];
    function input(
      organizationId: string,
      aggregateId = sourceId,
    ): SemanticStageInput {
      const source = new Node({ id: '동일인', type: 'Person' });
      const target = new Node({ id: '같은 기술', type: 'Technology' });
      return {
        scope: { organizationId, aggregateKind: 'wiki_document', aggregateId },
        generationId: randomUUID(),
        signature: 'a'.repeat(64),
        fingerprint: 'b'.repeat(64),
        sourceUpdatedAt: new Date(0),
        createdAt: new Date('2026-10-01T00:00:00Z'),
        chunks: ['동일인은 같은 기술을 쓴다.'],
        vectors: [[1, ...Array.from({ length: 767 }, () => 0)]],
        graphs: [
          new GraphDocument({
            nodes: [source, target],
            relationships: [new Relationship({ source, target, type: 'USES' })],
            source: new Document({ pageContent: '동일인은 같은 기술을 쓴다.' }),
          }),
        ],
      };
    }
    beforeAll(async () => {
      app = await Test.createTestingModule({
        providers: [
          LangchainNeo4jSemanticGraphAdapter,
          {
            provide: knowledgeGraphConfig.KEY,
            useValue: knowledgeGraphConfig(),
          },
          { provide: SemanticEmbedder, useClass: StorageEmbeddingFixture },
        ],
      }).compile();
      store = app.get(LangchainNeo4jSemanticGraphAdapter);
      const config = knowledgeGraphConfig();
      if (!config.url || !config.username || !config.password)
        throw new Error('격리 CE 설정이 없습니다.');
      graph = await createNeo4jGraph({
        url: config.url,
        username: config.username,
        password: config.password,
      });
      inputs.push(input(orgA), input(orgB), input(orgA, randomUUID()));
      for (const row of inputs) await store.stageGeneration(row);
    });
    afterAll(async () => {
      await app?.close();
      if (graph) {
        await graph.query(
          'MATCH (n) WHERE n.organizationId IN $organizations DETACH DELETE n',
          { organizations: [orgA, orgB] },
        );
        await graph.close();
      }
    });
    it('N7-02·03 동명이인과 같은 sourceId도 조직·문서마다 노드와 관계가 분리된다', async () => {
      expect(
        await graph.query(
          'MATCH (e:KGSemanticEntity) WHERE e.organizationId IN $organizations RETURN count(e) AS entities, count(DISTINCT e.key) AS uniqueKeys',
          { organizations: [orgA, orgB] },
        ),
      ).toEqual([{ entities: '6', uniqueKeys: '6' }]);
      expect(
        await graph.query(
          'MATCH (s:KGSemanticEntity)-[r:KG_SEMANTIC_RELATION]->(t:KGSemanticEntity) WHERE r.organizationId IN $organizations AND (s.organizationId<>t.organizationId OR s.sourceId<>t.sourceId OR s.generationId<>t.generationId) RETURN count(r) AS crossed',
          { organizations: [orgA, orgB] },
        ),
      ).toEqual([{ crossed: '0' }]);
    });
    it('N7-04 GC는 자기 source의 이전 세대만 지우고 다른 조직·문서·업무 원본을 보존한다', async () => {
      const first = inputs[0];
      if (!first) throw new Error('첫 의미 세대가 없습니다.');
      await graph.query(
        'CREATE (:KGWorkOSWikiDocument {organizationId:$org, key:$key}), (:KGCuratedNode {organizationId:$org, key:$curatedKey})',
        {
          org: orgA,
          key: `p7-storage-authoritative-${randomUUID()}`,
          curatedKey: `p7-storage-curated-${randomUUID()}`,
        },
      );
      const current = input(orgA);
      await store.stageGeneration(current);
      expect(
        await store.deleteInactiveGenerations(
          current.scope,
          current.generationId,
          new Date('2026-10-09T00:00:00Z'),
        ),
      ).toBe(true);
      expect(
        await graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId IN $organizations RETURN count(c) AS chunks',
          { organizations: [orgA, orgB] },
        ),
      ).toEqual([{ chunks: '3' }]);
      expect(
        await graph.query(
          'MATCH (n:KGWorkOSWikiDocument) WHERE n.organizationId=$org RETURN count(n) AS kept',
          { org: orgA },
        ),
      ).toEqual([{ kept: '1' }]);
      expect(
        await graph.query(
          'MATCH (n:KGCuratedNode) WHERE n.organizationId=$org RETURN count(n) AS kept',
          { org: orgA },
        ),
      ).toEqual([{ kept: '1' }]);
    });
    it('N7-05 벡터 index는 여러 staging 호출에도 하나의768차원 정의를 유지한다', async () => {
      const rows = await graph.query(
        "SHOW INDEXES YIELD name, type, options WHERE name='kg_semantic_chunk_embedding_v1' RETURN type, options.indexConfig['vector.dimensions'] AS dimension",
      );
      expect(rows).toEqual([{ type: 'VECTOR', dimension: '768' }]);
    });
    it('N7-04 grace 전 orphan은 삭제하지 않고 GC가 아직 남았음을 반환한다', async () => {
      const young = { ...input(orgB), createdAt: new Date() };
      await store.stageGeneration(young);
      expect(
        await store.deleteInactiveGenerations(
          young.scope,
          null,
          new Date('2026-10-01T00:00:00Z'),
        ),
      ).toBe(false);
      expect(
        await graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN count(c) AS kept',
          { org: orgB, generation: young.generationId },
        ),
      ).toEqual([{ kept: '1' }]);
    });
  },
);
