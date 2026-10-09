import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import { KnowledgeGraphProjectionProcessor } from '@/jobs/knowledge-graph/knowledge-graph-projection.processor';
import { KnowledgeGraphReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-reconciliation.scheduler';
import { KnowledgeGraphSemanticProcessor } from '@/jobs/knowledge-graph/knowledge-graph-semantic.processor';
import { KnowledgeGraphSemanticReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-semantic-reconciliation.scheduler';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { SemanticGraphExtractor } from '@/knowledge-graph/infrastructure/extraction/semantic-graph-extractor.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import {
  TestSemanticEmbedder,
  TestSemanticExtractor,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';
import { waitForCondition } from '@/testing/wait-for-condition';

import {
  createRunPrefix,
  KnowledgeGraphHttpFixture,
  refreshPath,
  statusPath,
  type TestUser,
} from '@test/knowledge-graph/support/knowledge-graph-http.fixture';

const docker = promisify(execFile);
jest.setTimeout(120_000);

describeKnowledgeGraph('위키 갱신 접수 → Jobs 색인 전체 흐름 E2E', () => {
  const prefix = createRunPrefix('refresh-flow');
  const extractor = new TestSemanticExtractor();
  const embedder = new TestSemanticEmbedder();
  const originalEnv = { ...process.env };
  let fx: KnowledgeGraphHttpFixture;
  let jobs: TestingModule | null = null;
  const organizations = new Set<string>();
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;

  beforeAll(async () => {
    // 투영·의미 색인 Jobs 결선은 기능 플래그에 달려 있으므로 실행 셸 환경에 기대지 않고 명시한다.
    process.env.KG_PROJECTION_ENABLED = 'true';
    process.env.KG_SEMANTIC_ENABLED = 'true';
    fx = await KnowledgeGraphHttpFixture.boot(prefix);
    process.env.BULLMQ_PREFIX = `p8-flow-${randomUUID()}`;
    graph = await createNeo4jGraph({
      url: process.env.NEO4J_URI!,
      username: process.env.NEO4J_USERNAME!,
      password: process.env.NEO4J_PASSWORD!,
    });
    await startJobs();
  });
  afterAll(async () => {
    await stopJobs();
    if (graph) {
      await graph.query(
        'MATCH (n) WHERE n.organizationId IN $organizations OR (n:KGProjectionSource AND any(org IN $organizations WHERE n.key CONTAINS org)) DETACH DELETE n',
        { organizations: [...organizations] },
      );
      await graph.close();
    }
    await fx?.close();
    process.env = originalEnv;
  });

  async function startJobs() {
    // KnowledgeGraphSemanticJobsModule은 ConditionalModule로 jobs.module 로드 시점에 결선이 정해지므로 플래그를 켠 뒤 불러온다.
    const { JobsModule } = await import('@/jobs/jobs.module');
    jobs = await Test.createTestingModule({ imports: [JobsModule] })
      .overrideProvider(SemanticGraphExtractor)
      .useValue(extractor)
      .overrideProvider(SemanticEmbedder)
      .useValue(embedder)
      .compile();
    await jobs.init();
    await jobs.get(KnowledgeGraphReconciliationScheduler).onModuleDestroy();
    await jobs
      .get(KnowledgeGraphSemanticReconciliationScheduler)
      .onModuleDestroy();
  }

  async function stopJobs() {
    if (!jobs) return;
    for (const relay of jobs.get(OutboxRelay, { each: true }))
      await relay.stop();
    await jobs.close();
    jobs = null;
  }

  async function setup(key: string, text: string) {
    const owner = await fx.createUser(`${key}-owner`);
    const organizationId = await fx.createOrganization(owner, key);
    organizations.add(organizationId);
    const doc = await fx.createWikiDocument(owner, organizationId, {
      title: `${key} 문서`,
      contentMarkdown: text,
    });
    return { owner, organizationId, documentId: doc.id, text };
  }

  const scopeOf = (organizationId: string, aggregateId: string) => ({
    organizationId,
    aggregateKind: 'wiki_document' as const,
    aggregateId,
  });

  async function observed(organizationId: string, documentId: string) {
    const states = fx.app.get(OutboxSemanticSourceState, { strict: false });
    await waitForCondition(
      async () =>
        (await states.current(scopeOf(organizationId, documentId)))?.state
          ?.observedSeq === 1,
      'Jobs가 원본 관측을 기록하지 않았습니다.',
      { timeoutMs: 40_000 },
    );
  }

  async function waitStatus(
    owner: TestUser,
    organizationId: string,
    documentId: string,
    status: string,
  ) {
    await waitForCondition(
      async () =>
        (await owner.agent.get(statusPath(organizationId, documentId))).body
          .status === status,
      `status가 ${status}에 도달하지 않았습니다.`,
      { timeoutMs: 40_000 },
    );
  }

  it('H8-03 Redis 중단 중에도 202·accepted를 유지하고 복구 뒤 추가 quiet 없이 up_to_date로 수렴한다', async () => {
    const { owner, organizationId, documentId, text } = await setup(
      'h803',
      'Redis 장애 중에도 갱신 요청은 PostgreSQL에 영속 접수된다.',
    );
    await observed(organizationId, documentId);
    await docker('docker', ['pause', 'workos-graph-verification-redis']);
    let requestId: string;
    try {
      const response = await owner.agent
        .post(refreshPath(organizationId, documentId))
        .send({});
      expect(response.status).toBe(202);
      requestId = response.body.requestId as string;
      const pending = await owner.agent.get(
        statusPath(organizationId, documentId),
      );
      expect(pending.body).toMatchObject({ status: 'accepted', requestId });
      expect(extractor.calls.filter((call) => call === text)).toHaveLength(0);
    } finally {
      await docker('docker', ['unpause', 'workos-graph-verification-redis']);
    }

    const recoveredAt = performance.now();
    await jobs!.get(KnowledgeGraphSemanticReconciliationScheduler).runOnce();
    await waitStatus(owner, organizationId, documentId, 'up_to_date');

    expect(performance.now() - recoveredAt).toBeLessThan(30_000);
    expect(extractor.calls.filter((call) => call === text)).toHaveLength(1);
    expect(
      (await owner.agent.get(statusPath(organizationId, documentId))).body,
    ).toMatchObject({ latestRequest: { requestId, satisfied: true } });
  });

  it('F8-02 자동 대기 중 수동 요청 연타와 Jobs 재기동 뒤에도 모델 실행은 한 번이고 상태가 수렴한다', async () => {
    const { owner, organizationId, documentId, text } = await setup(
      'f802',
      'Jobs가 멈춘 사이 접수된 갱신 요청은 재기동 뒤 한 번만 색인된다.',
    );
    await observed(organizationId, documentId);
    await stopJobs();
    const burst = await Promise.all(
      Array.from({ length: 5 }, () =>
        owner.agent.post(refreshPath(organizationId, documentId)).send({}),
      ),
    );
    expect(burst.every(({ status }) => status === 202)).toBe(true);
    expect(new Set(burst.map(({ body }) => body.requestId)).size).toBe(1);
    expect(
      (await owner.agent.get(statusPath(organizationId, documentId))).body
        .status,
    ).toBe('accepted');

    await startJobs();
    await jobs!.get(KnowledgeGraphSemanticReconciliationScheduler).runOnce();
    await waitStatus(owner, organizationId, documentId, 'up_to_date');

    expect(extractor.calls.filter((call) => call === text)).toHaveLength(1);
    const again = await owner.agent
      .post(refreshPath(organizationId, documentId))
      .send({});
    expect(again.status).toBe(202);
    expect(again.body.requestId).not.toBe(burst[0]!.body.requestId);
  });

  it('H8-19 API 앱에는 worker·processor·relay가 없고 Jobs 앱에만 있다', () => {
    for (const worker of [
      KnowledgeGraphProjectionProcessor,
      KnowledgeGraphSemanticProcessor,
      KnowledgeGraphSemanticReconciliationScheduler,
    ]) {
      expect(() => fx.app.get(worker, { strict: false })).toThrow();
      expect(jobs!.get(worker, { strict: false })).toBeDefined();
    }
    expect(fx.app.get(OutboxRelay, { strict: false }).running).toBe(false);
    expect(
      jobs!.get(OutboxRelay, { each: true }).some((relay) => relay.running),
    ).toBe(true);
  });
});
