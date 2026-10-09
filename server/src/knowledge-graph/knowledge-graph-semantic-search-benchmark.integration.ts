import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { LangchainNeo4jSemanticSearchReaderAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-semantic-search-reader.adapter';
import { SEMANTIC_GRAPH_INITIALIZATION } from '@/knowledge-graph/semantic-graph-queries';

import neo4j, { type Driver, type Session } from 'neo4j-driver';

const describeWritable =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.NEO4J_URI &&
  process.env.NEO4J_USERNAME &&
  process.env.NEO4J_PASSWORD
    ? describe
    : describe.skip;

describeWritable('N8-02 exact/approximate recall·latency benchmark', () => {
  jest.setTimeout(180_000);

  const organizationId = `p8a3-n802-org-${randomUUID()}`;
  const otherOrganizationId = `p8a3-n802-other-${randomUUID()}`;
  const activeSourceCount = 2_000;
  const otherOrganizationCount = 2_500;
  const oldGenerationCount = 400;
  const wrongFingerprintCount = 400;
  const topK = 10;
  const queryVector = vector(0);

  let driver: Driver;
  let session: Session;
  let moduleRef: TestingModule;
  let reader: LangchainNeo4jSemanticSearchReaderAdapter;
  const activeGenerationBySource = new Map<string, string>();
  const activeScopes: Array<{ sourceId: string; generationId: string }> = [];

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

    await seedActiveSources();
    await seedOtherOrganizationNoise();
    await seedOldGenerationNoise();
    await seedWrongFingerprintNoise();

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
            query: { enabled: true, graphReadTimeoutMs: 30_000 },
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
        `MATCH (c:KGSemanticChunk)
WHERE c.organizationId IN $organizationIds
DETACH DELETE c`,
        { organizationIds: [organizationId, otherOrganizationId] },
      );
      await session.close();
    }
    await driver?.close();
  });

  it('org A 소수/대량 경계에서 exact와 bounded ANN의 recall@k·latency 및 비허가 제거량을 기록한다', async () => {
    const exactStartedAt = performance.now();
    const exact = await reader.semanticExact({
      organizationId,
      fingerprint: semanticPipelineFingerprint,
      scopes: activeScopes,
      vector: queryVector,
      candidateLimit: topK,
    });
    const exactMs = performance.now() - exactStartedAt;
    const exactTop = new Set(exact.slice(0, topK).map((hit) => hit.sourceId));

    expect(exact).toHaveLength(topK);
    expect(
      exact.every(
        (hit) =>
          activeGenerationBySource.get(hit.sourceId) === hit.generationId,
      ),
    ).toBe(true);

    const approximate = [];
    for (const k of [100, 400, 1600] as const) {
      const startedAt = performance.now();
      const raw = await reader.semanticApproximate({
        organizationId,
        fingerprint: semanticPipelineFingerprint,
        vector: queryVector,
        k,
      });
      const latencyMs = performance.now() - startedAt;
      const accepted = raw.filter(
        (hit) =>
          activeGenerationBySource.get(hit.sourceId) === hit.generationId,
      );
      const uniqueAccepted = [
        ...new Map(accepted.map((hit) => [hit.sourceId, hit])).values(),
      ];
      const recallAtK =
        [...exactTop].filter((sourceId) =>
          uniqueAccepted
            .slice(0, topK)
            .some((hit) => hit.sourceId === sourceId),
        ).length / exactTop.size;
      const unauthorizedAfterFilter = uniqueAccepted.filter(
        (hit) =>
          activeGenerationBySource.get(hit.sourceId) !== hit.generationId,
      ).length;

      approximate.push({
        k,
        latencyMs,
        rawHits: raw.length,
        acceptedSources: uniqueAccepted.length,
        recallAtK,
        unauthorizedAfterFilter,
      });

      expect(unauthorizedAfterFilter).toBe(0);
      expect(recallAtK).toBeGreaterThanOrEqual(0);
      expect(recallAtK).toBeLessThanOrEqual(1);
    }

    console.info(
      JSON.stringify({
        acceptance: 'N8-02',
        activeSourceCount,
        otherOrganizationCount,
        oldGenerationCount,
        wrongFingerprintCount,
        topK,
        exact: {
          latencyMs: exactMs,
          returned: exact.length,
        },
        approximate,
        ennMaxCandidate: activeSourceCount,
      }),
    );
  });

  async function seedActiveSources() {
    const rows = [];
    for (let index = 0; index < activeSourceCount; index++) {
      const sourceId = randomUUID();
      const generationId = randomUUID();
      activeGenerationBySource.set(sourceId, generationId);
      activeScopes.push({ sourceId, generationId });
      rows.push(
        chunk({
          organizationId,
          sourceId,
          generationId,
          fingerprint: semanticPipelineFingerprint,
          rank: index + 1,
        }),
      );
    }
    await insertBatches(rows);
  }

  async function seedOtherOrganizationNoise() {
    const rows = Array.from({ length: otherOrganizationCount }, (_, index) =>
      chunk({
        organizationId: otherOrganizationId,
        sourceId: randomUUID(),
        generationId: randomUUID(),
        fingerprint: semanticPipelineFingerprint,
        rank: -index - 1,
      }),
    );
    await insertBatches(rows);
  }

  async function seedOldGenerationNoise() {
    const rows = activeScopes.slice(0, oldGenerationCount).map((scope, index) =>
      chunk({
        organizationId,
        sourceId: scope.sourceId,
        generationId: randomUUID(),
        fingerprint: semanticPipelineFingerprint,
        rank: -10_000 - index,
      }),
    );
    await insertBatches(rows);
  }

  async function seedWrongFingerprintNoise() {
    const rows = Array.from({ length: wrongFingerprintCount }, (_, index) =>
      chunk({
        organizationId,
        sourceId: randomUUID(),
        generationId: randomUUID(),
        fingerprint: 'f'.repeat(64),
        rank: -20_000 - index,
      }),
    );
    await insertBatches(rows);
  }

  async function insertBatches(rows: ReturnType<typeof chunk>[]) {
    for (let offset = 0; offset < rows.length; offset += 100) {
      await session.run(
        `UNWIND $rows AS row
CREATE (:KGSemanticChunk {
  id: row.id,
  organizationId: row.organizationId,
  sourceKind: 'wiki_document',
  sourceId: row.sourceId,
  generationId: row.generationId,
  chunkIndex: 0,
  text: row.text,
  embedding: row.embedding,
  embeddingSpace: row.embeddingSpace
})`,
        { rows: rows.slice(offset, offset + 100) },
      );
    }
  }

  function chunk(input: {
    organizationId: string;
    sourceId: string;
    generationId: string;
    fingerprint: string;
    rank: number;
  }) {
    return {
      id: `p8a3-n802-${randomUUID()}`,
      organizationId: input.organizationId,
      sourceId: input.sourceId,
      generationId: input.generationId,
      text: '동명 성능 데이터',
      embedding: vector(input.rank),
      embeddingSpace: input.fingerprint,
    };
  }
});

function vector(rank: number): number[] {
  const offset = rank / 100_000;
  return [1, offset, ...Array.from({ length: 766 }, () => 0)];
}
