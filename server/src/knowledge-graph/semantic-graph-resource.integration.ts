import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import {
  createNeo4jGraph,
  GraphDocument,
  Neo4jGraph,
  Neo4jVectorStore,
} from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import type { SemanticStageInput } from '@/knowledge-graph/domain/semantic-generation';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { LangchainNeo4jSemanticGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-semantic-graph.adapter';
import { READ_SEMANTIC_VECTOR_INDEX } from '@/knowledge-graph/infrastructure/graph/semantic-vector-index';
import { deleteSemanticNodesQuery } from '@/knowledge-graph/semantic-graph-queries';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';

import { Document } from '@langchain/core/documents';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { waitForCondition } from '@test/agent/support/teamspace-agent.e2e-support';
import { z } from 'zod';

const vector = () => [1, ...Array.from({ length: 767 }, () => 0)];
class ResourceEmbeddingFixture extends SemanticEmbedder {
  async embedDocuments(texts: readonly string[]) {
    return texts.map(vector);
  }
  async embedQuery() {
    return vector();
  }
  asLangchainEmbeddings(): EmbeddingsInterface {
    return {
      embedDocuments: (texts) => this.embedDocuments(texts),
      embedQuery: () => this.embedQuery(),
    };
  }
}

/** 설치 driver의 내부 관측은 시험에만 한정하며 제품 port에 노출하지 않는다. */
function inUseCounts(store: Neo4jVectorStore) {
  let current: object = store;
  for (const key of ['driver', '_connectionProvider', '_connectionPool']) {
    const value = Reflect.get(current, key);
    if (!value || typeof value !== 'object')
      throw new Error(`설치 driver 관측 경로가 없습니다: ${key}`);
    current = value;
  }
  return z
    .record(z.string(), z.number().int().nonnegative())
    .parse(Reflect.get(current, '_activeResourceCounts'));
}

describeKnowledgeGraph('실제 CE의 대량 벡터 저장과 연결 자원·검색 범위', () => {
  jest.setTimeout(60_000);
  const orgA = `p7-resource-a-${randomUUID()}`;
  const orgB = `p7-resource-b-${randomUUID()}`;
  let app: TestingModule;
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let capturedStore: Neo4jVectorStore | undefined;
  let generation: SemanticStageInput;
  function observeInitialization() {
    const initializationMock = jest.spyOn(
      Neo4jVectorStore,
      'fromExistingIndex',
    );
    const initialize = initializationMock.getMockImplementation();
    if (!initialize) throw new Error('원본 vector 초기화 구현이 없습니다.');
    return initializationMock.mockImplementation(async (...args) => {
      capturedStore = await initialize.call(Neo4jVectorStore, ...args);
      return capturedStore;
    });
  }
  let initializeSpy: ReturnType<typeof observeInitialization>;
  function input(organizationId: string, count: number): SemanticStageInput {
    const chunks = Array.from(
      { length: count },
      (_, index) => `연결 자원 검증 본문 ${index}`,
    );
    return {
      scope: {
        organizationId,
        aggregateKind: 'wiki_document',
        aggregateId: randomUUID(),
      },
      generationId: randomUUID(),
      signature: 'a'.repeat(64),
      fingerprint: 'b'.repeat(64),
      sourceUpdatedAt: new Date(0),
      createdAt: new Date(),
      chunks,
      vectors: chunks.map(vector),
      graphs: chunks.map(
        (text) =>
          new GraphDocument({
            nodes: [],
            relationships: [],
            source: new Document({ pageContent: text }),
          }),
      ),
    };
  }
  beforeAll(async () => {
    initializeSpy = observeInitialization();
    app = await Test.createTestingModule({
      providers: [
        LangchainNeo4jSemanticGraphAdapter,
        { provide: knowledgeGraphConfig.KEY, useValue: knowledgeGraphConfig() },
        { provide: SemanticEmbedder, useClass: ResourceEmbeddingFixture },
      ],
    }).compile();
    const config = knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('격리 CE 설정이 없습니다.');
    graph = await createNeo4jGraph({
      url: config.url,
      username: config.username,
      password: config.password,
    });
    const adapter = app.get(LangchainNeo4jSemanticGraphAdapter);
    generation = input(orgA, 1000);
    await adapter.stageGeneration(generation);
    await adapter.stageGeneration(input(orgB, 1));
  });
  afterAll(async () => {
    initializeSpy?.mockRestore();
    await app?.close();
    if (capturedStore)
      expect(
        Object.values(inUseCounts(capturedStore)).every((count) => count === 0),
      ).toBe(true);
    if (graph) {
      await graph.query(
        'MATCH (n) WHERE n.organizationId IN $organizations DETACH DELETE n',
        { organizations: [orgA, orgB] },
      );
      await graph.close();
    }
  });
  it('N7-08 공식 addVectors로1000 chunk를 저장한 뒤 pool in-use는0이고 다음 조회도 성공한다', async () => {
    if (!capturedStore)
      throw new Error('공식 벡터 저장소가 초기화되지 않았습니다.');
    const counts = Object.values(inUseCounts(capturedStore));
    expect(counts.every((count) => count === 0)).toBe(true);
    const activeQuery = capturedStore.query(
      'CALL apoc.util.sleep(300) RETURN 1 AS observed',
    );
    try {
      await waitForCondition(
        async () =>
          capturedStore !== undefined &&
          Object.values(inUseCounts(capturedStore)).some((count) => count > 0),
        '실행 중 연결 사용량을 관찰하지 못했습니다.',
      );
    } finally {
      await activeQuery;
    }
    expect(
      Object.values(inUseCounts(capturedStore)).every((count) => count === 0),
    ).toBe(true);
    expect(
      await graph.query(
        'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org RETURN count(c) AS chunks',
        { org: orgA },
      ),
    ).toEqual([{ chunks: '1000' }]);
    expect(initializeSpy).toHaveBeenCalledTimes(1);
  });
  it('N7-09 공식 CE metadata 필터는 조직·source·generation·embedding space를 함께 제한한다', async () => {
    if (!capturedStore)
      throw new Error('공식 벡터 저장소가 초기화되지 않았습니다.');
    const filter = {
      organizationId: orgA,
      sourceKind: 'wiki_document',
      sourceId: generation.scope.aggregateId,
      generationId: generation.generationId,
      embeddingSpace: generation.fingerprint,
    };
    const rows = await capturedStore.similaritySearchVectorWithScore(
      vector(),
      10,
      '',
      { filter },
    );
    expect(rows).toHaveLength(10);
    for (const [document] of rows)
      expect(document.metadata).toMatchObject(filter);
    expect(
      await capturedStore.similaritySearchVectorWithScore(vector(), 10, '', {
        filter: { ...filter, embeddingSpace: 'c'.repeat(64) },
      }),
    ).toEqual([]);
    expect(
      await capturedStore.similaritySearchVectorWithScore(vector(), 10, '', {
        filter: { ...filter, generationId: randomUUID() },
      }),
    ).toEqual([]);
    expect(
      Object.values(inUseCounts(capturedStore)).every((count) => count === 0),
    ).toBe(true);
  });
  it('N7-05 다른 차원 정의는 공식 벡터 driver 생성 전에 거부하고 자기 graph 연결을 종료한다', async () => {
    const changedDefinition = jest.spyOn(Neo4jGraph.prototype, 'query');
    const query = changedDefinition.getMockImplementation();
    if (!query) throw new Error('원본 graph query 구현이 없습니다.');
    changedDefinition.mockImplementation(async function (
      this: Neo4jGraph,
      ...args
    ) {
      if (args[0] === READ_SEMANTIC_VECTOR_INDEX)
        return [
          {
            type: 'VECTOR',
            labelsOrTypes: ['KGSemanticChunk'],
            properties: ['embedding'],
            dimension: '384',
            similarity: 'COSINE',
          },
        ];
      return query.apply(this, args);
    });
    const ownApp = await Test.createTestingModule({
      providers: [
        LangchainNeo4jSemanticGraphAdapter,
        { provide: knowledgeGraphConfig.KEY, useValue: knowledgeGraphConfig() },
        { provide: SemanticEmbedder, useClass: ResourceEmbeddingFixture },
      ],
    }).compile();
    const initializedBefore = initializeSpy.mock.calls.length;
    const closing = jest.spyOn(Neo4jGraph.prototype, 'close');
    try {
      await expect(
        ownApp
          .get(LangchainNeo4jSemanticGraphAdapter)
          .stageGeneration(input(orgA, 1)),
      ).rejects.toThrow('GRAPH_STORE_UNAVAILABLE');
      expect(initializeSpy).toHaveBeenCalledTimes(initializedBefore);
    } finally {
      changedDefinition.mockRestore();
      try {
        await ownApp.close();
        expect(closing).toHaveBeenCalledTimes(1);
      } finally {
        closing.mockRestore();
      }
    }
  });
  it('GC label을 나눠도 원문의 전체100회·10만 노드 상한을 공유한다', async () => {
    let batches = 0;
    const deletion = jest.spyOn(Neo4jGraph.prototype, 'query');
    const query = deletion.getMockImplementation();
    if (!query) throw new Error('원본 graph query 구현이 없습니다.');
    deletion.mockImplementation(async function (this: Neo4jGraph, ...args) {
      if (args[0] === deleteSemanticNodesQuery('KGSemanticChunk', false)) {
        batches++;
        return [{ deleted: batches < 100 ? '1000' : '500' }];
      }
      if (args[0] === deleteSemanticNodesQuery('KGSemanticEntity', false)) {
        batches++;
        return [{ deleted: '1000' }];
      }
      return query.apply(this, args);
    });
    try {
      expect(
        await app
          .get(LangchainNeo4jSemanticGraphAdapter)
          .deleteInactiveGenerations(
            generation.scope,
            generation.generationId,
            new Date(),
          ),
      ).toBe(false);
      expect(batches).toBe(100);
    } finally {
      deletion.mockRestore();
    }
  });
});
