import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { assertSemanticSearchVectorIndexReady } from '@/knowledge-graph/domain/graph-semantic-search-readiness';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { LangchainNeo4jSemanticSearchReaderAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-semantic-search-reader.adapter';
import {
  SEARCH_SEMANTIC_EXACT,
  SEMANTIC_CHUNK_VECTOR_INDEX,
  SHOW_SEMANTIC_VECTOR_INDEX,
} from '@/knowledge-graph/knowledge-graph-search-queries';
import { SEMANTIC_GRAPH_INITIALIZATION } from '@/knowledge-graph/semantic-graph-queries';

import neo4j, { type Driver, type Plan, type Session } from 'neo4j-driver';

const describeWritable =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.NEO4J_URI &&
  process.env.NEO4J_USERNAME &&
  process.env.NEO4J_PASSWORD
    ? describe
    : describe.skip;

describeWritable('N8-01·06 실제 Neo4j 의미 검색', () => {
  jest.setTimeout(90_000);

  const organizationId = `p8a3-n8-org-${randomUUID()}`;
  const otherOrganizationId = `p8a3-n8-other-${randomUUID()}`;
  const sourceId = randomUUID();
  const generationId = randomUUID();
  const otherGenerationId = randomUUID();
  const badVectorIndex = 'p8a3_semantic_bad_dimension';
  const badVectorLabel = 'P8A3BadVectorChunk';

  let moduleRef: TestingModule;
  let reader: LangchainNeo4jSemanticSearchReaderAdapter;
  let driver: Driver;
  let session: Session;

  beforeAll(async () => {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(
        process.env.NEO4J_USERNAME!,
        process.env.NEO4J_PASSWORD!,
      ),
    );
    session = driver.session({
      database: process.env.NEO4J_DATABASE || undefined,
    });

    for (const query of SEMANTIC_GRAPH_INITIALIZATION) await session.run(query);

    await session.run(
      `
UNWIND $rows AS row
CREATE (:KGSemanticChunk {
  id: row.id,
  organizationId: row.organizationId,
  sourceKind: 'wiki_document',
  sourceId: row.sourceId,
  generationId: row.generationId,
  chunkIndex: row.chunkIndex,
  text: row.text,
  embedding: row.embedding,
  embeddingSpace: row.embeddingSpace
})
`,
      {
        rows: [
          chunk({
            organizationId,
            sourceId,
            generationId,
            embeddingSpace: semanticPipelineFingerprint,
            text: '허용된 현재 세대',
          }),
          chunk({
            organizationId: otherOrganizationId,
            sourceId,
            generationId,
            embeddingSpace: semanticPipelineFingerprint,
            text: '다른 조직',
          }),
          chunk({
            organizationId,
            sourceId,
            generationId: otherGenerationId,
            embeddingSpace: semanticPipelineFingerprint,
            text: '이전 세대',
          }),
          chunk({
            organizationId,
            sourceId,
            generationId,
            embeddingSpace: 'f'.repeat(64),
            text: '다른 임베딩 공간',
          }),
        ],
      },
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        LangchainNeo4jSemanticSearchReaderAdapter,
        {
          provide: knowledgeGraphConfig.KEY,
          useValue: {
            url: process.env.NEO4J_URI,
            username: process.env.NEO4J_USERNAME,
            password: process.env.NEO4J_PASSWORD,
            database: process.env.NEO4J_DATABASE || undefined,
            query: { enabled: true, graphReadTimeoutMs: 10_000 },
          },
        },
      ],
    }).compile();
    reader = moduleRef.get(LangchainNeo4jSemanticSearchReaderAdapter);
  });

  afterAll(async () => {
    await moduleRef?.close();
    if (session) {
      await session.run(
        `MATCH (n:KGSemanticChunk)
WHERE n.organizationId IN $organizationIds
DETACH DELETE n`,
        { organizationIds: [organizationId, otherOrganizationId] },
      );
      await session.run(`DROP INDEX ${badVectorIndex} IF EXISTS`);
      await session.close();
    }
    await driver?.close();
  });

  it('N8-01 Q-S1은 NodeIndexSeek를 사용하고 scope 밖 org·generation·embeddingSpace를 반환하지 않는다', async () => {
    const vector = unitVector(768);
    const scopes = [{ sourceId, generationId }];

    const hits = await reader.semanticExact({
      organizationId,
      fingerprint: semanticPipelineFingerprint,
      scopes,
      vector,
      candidateLimit: 10,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      sourceId,
      generationId,
      text: '허용된 현재 세대',
    });

    const explained = await session.run(`EXPLAIN ${SEARCH_SEMANTIC_EXACT}`, {
      organizationId,
      fingerprint: semanticPipelineFingerprint,
      scopes,
      vector,
      candidateLimit: 10,
    });
    if (!explained.summary.plan)
      throw new Error('N8-01 EXPLAIN plan이 없습니다.');

    const operators = collectOperators(explained.summary.plan);
    console.info(
      JSON.stringify({
        acceptance: 'N8-01',
        operators,
        returned: hits.length,
      }),
    );
    expect(
      operators.some((operator) => operator.startsWith('NodeIndexSeek')),
    ).toBe(true);
  });

  it('N8-06 없는 index와 3차원 자기 index를 거부하고 공용 vector index 정의는 바꾸지 않는다', async () => {
    const canonicalBefore = await vectorIndexDefinition(
      SEMANTIC_CHUNK_VECTOR_INDEX,
    );
    expect(canonicalBefore).toEqual([
      expect.objectContaining({ state: 'ONLINE', dimension: 768 }),
    ]);

    const missing = await vectorIndexDefinition('p8a3_missing_vector_index');
    expect(() => assertSemanticSearchVectorIndexReady(missing)).toThrow(
      expect.objectContaining({ reason: 'KG_VECTOR_INDEX_NOT_READY' }),
    );

    await session.run(
      `CREATE VECTOR INDEX ${badVectorIndex} IF NOT EXISTS
FOR (n:${badVectorLabel}) ON n.embedding
OPTIONS { indexConfig: {
  \`vector.dimensions\`: 3,
  \`vector.similarity_function\`: 'cosine'
} }`,
    );
    await session.run('CALL db.awaitIndex($indexName, 30)', {
      indexName: badVectorIndex,
    });

    const bad = await vectorIndexDefinition(badVectorIndex);
    expect(bad).toEqual([
      expect.objectContaining({ state: 'ONLINE', dimension: 3 }),
    ]);
    expect(() => assertSemanticSearchVectorIndexReady(bad)).toThrow(
      expect.objectContaining({ reason: 'KG_VECTOR_INDEX_NOT_READY' }),
    );

    expect(await vectorIndexDefinition(SEMANTIC_CHUNK_VECTOR_INDEX)).toEqual(
      canonicalBefore,
    );
  });

  function chunk(input: {
    organizationId: string;
    sourceId: string;
    generationId: string;
    embeddingSpace: string;
    text: string;
  }) {
    return {
      id: `p8a3-n8-${randomUUID()}`,
      ...input,
      chunkIndex: 0,
      embedding: unitVector(768),
    };
  }

  async function vectorIndexDefinition(indexName: string) {
    const result = await session.run(SHOW_SEMANTIC_VECTOR_INDEX, {
      indexName,
    });
    return result.records.map((record) => ({
      state: String(record.get('state')),
      dimension: Number(record.get('dimension')),
    }));
  }
});

function unitVector(dimensions: number): number[] {
  return [1, ...Array.from({ length: dimensions - 1 }, () => 0)];
}

function collectOperators(plan: Plan): string[] {
  return [
    plan.operatorType,
    ...plan.children.flatMap((child) => collectOperators(child)),
  ];
}
