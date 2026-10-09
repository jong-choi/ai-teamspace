import { Test, type TestingModule } from '@nestjs/testing';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { assertSemanticEmbeddingBatch } from '@/knowledge-graph/domain/semantic-embedding';
import { GeminiEmbedding2Adapter } from '@/knowledge-graph/infrastructure/embedding/gemini/gemini-embedding-2.adapter';
import { OllamaCloudSemanticExtractorAdapter } from '@/knowledge-graph/infrastructure/extraction/ollama-cloud/ollama-cloud-semantic-extractor.adapter';

const liveEnabled =
  process.env.KG_SEMANTIC_LIVE === 'true' &&
  Boolean(process.env.OLLAMA_API_KEY) &&
  Boolean(process.env.GEMINI_API_KEY);
const describeLive = liveEnabled ? describe : describe.skip;
if (!liveEnabled)
  console.info(
    'L7-01·02·04 skipped: 실제 공급자 opt-in 또는 공급자 키가 없습니다.',
  );

describeLive('명시적 opt-in 실제 의미 공급자 수락과 품질 측정', () => {
  jest.setTimeout(600_000);
  let app: TestingModule;
  let extractor: OllamaCloudSemanticExtractorAdapter;
  let embedder: GeminiEmbedding2Adapter;
  beforeAll(async () => {
    app = await Test.createTestingModule({
      providers: [
        OllamaCloudSemanticExtractorAdapter,
        GeminiEmbedding2Adapter,
        { provide: knowledgeGraphConfig.KEY, useValue: knowledgeGraphConfig() },
      ],
    }).compile();
    extractor = app.get(OllamaCloudSemanticExtractorAdapter);
    embedder = app.get(GeminiEmbedding2Adapter);
  });
  afterAll(async () => {
    await app?.close();
  });
  it('L7-01 실제 gpt-oss:120b의 두 chunk Tool Calling 결과와 지연을 기록한다', async () => {
    const started = performance.now();
    const texts = [
      '지윤은 Neo4j를 사용한다. 지윤은 그래프 프로젝트를 담당한다.',
      '민수는 TypeScript를 사용한다. 민수는 검색 프로젝트를 담당한다.',
    ];
    const graphs = await Promise.all(
      texts.map((text, index) =>
        extractor.extract(text, index, AbortSignal.timeout(180_000)),
      ),
    );
    expect(graphs).toHaveLength(2);
    expect(graphs.every((graph) => graph.source.pageContent.length > 0)).toBe(
      true,
    );
    expect(graphs.every((graph) => graph.nodes.length > 0)).toBe(true);
    console.info(
      JSON.stringify({
        acceptance: 'L7-01',
        chunks: 2,
        nodes: graphs.map((graph) => graph.nodes.length),
        elapsedMs: performance.now() - started,
      }),
    );
  });
  it('L7-02 실제 Gemini의 세 입력은768차원이며 각 벡터의 자기 유사도가 최대다', async () => {
    const started = performance.now();
    const vectors = await embedder.embedDocuments(
      [
        'title: 그래프 | text: 그래프 데이터베이스에 관계를 저장한다.',
        'title: 회의 | text: 회의에서 다음 분기의 일정을 논의한다.',
        'title: 배포 | text: 서버 배포와 장애 대응 절차를 정리한다.',
      ],
      AbortSignal.timeout(180_000),
    );
    assertSemanticEmbeddingBatch(vectors, 3);
    const cosine = (a: number[], b: number[]) =>
      a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0) /
      Math.sqrt(
        a.reduce((sum, value) => sum + value * value, 0) *
          b.reduce((sum, value) => sum + value * value, 0),
      );
    for (const [index, current] of vectors.entries()) {
      const scores = vectors.map((other) => cosine(current, other));
      expect(scores[index]).toBeCloseTo(1, 6);
      expect(scores[index]).toBe(Math.max(...scores));
    }
    console.info(
      JSON.stringify({
        acceptance: 'L7-02',
        inputs: 3,
        dimensions: vectors.map((row) => row.length),
        elapsedMs: performance.now() - started,
      }),
    );
  });
  it('L7-04 사전 주석20개 fixture의 precision·recall·hallucination·지연을 측정하며 임의 합격선을 만들지 않는다', async () => {
    const technologies = [
      'Neo4j',
      'TypeScript',
      'Redis',
      'PostgreSQL',
      'React',
      'Expo',
      'Docker',
      'Kubernetes',
      'Git',
      'Jest',
      'Playwright',
      'Zustand',
      'LangChain',
      'Gemini',
      'Ollama',
      'Yjs',
      'BullMQ',
      'Drizzle',
      'Electron',
      'Tailwind',
    ];
    let predicted = 0;
    let expected = 0;
    let matched = 0;
    let hallucinated = 0;
    const latencies: number[] = [];
    const normalize = (value: string) =>
      value.normalize('NFKC').trim().toLocaleLowerCase('ko');
    const signal = AbortSignal.timeout(500_000);
    for (const [index, technology] of technologies.entries()) {
      const person = `검증사용자${index}`;
      const text = `${person}은 ${technology}를 사용한다.`;
      const truth = new Set([
        `Person:${normalize(person)}`,
        `Technology:${normalize(technology)}`,
      ]);
      const started = performance.now();
      const graph = await extractor.extract(text, index, signal);
      latencies.push(performance.now() - started);
      const actual = new Set(
        graph.nodes.map((node) => `${node.type}:${normalize(String(node.id))}`),
      );
      predicted += actual.size;
      expected += truth.size;
      for (const entity of actual) {
        if (truth.has(entity)) matched++;
        else hallucinated++;
      }
    }
    expect(latencies).toHaveLength(20);
    // 단순 주어·기술·USES 문장20개 표본의 entity 지표다. 일반 문서/관계 품질 보장은 아니다.
    console.info(
      JSON.stringify({
        acceptance: 'L7-04',
        fixtures: 20,
        precision: predicted ? matched / predicted : 0,
        recall: matched / expected,
        hallucinationRate: predicted ? hallucinated / predicted : 0,
        latencyMs: latencies,
        annotatedEntities: expected,
        predictedEntities: predicted,
      }),
    );
  });
});
