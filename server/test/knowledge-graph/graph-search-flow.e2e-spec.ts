import { randomUUID } from 'node:crypto';

import { OutboxRelay } from '@nestjs/outbox';
import {
  Test,
  type TestingModule,
  type TestingModuleBuilder,
} from '@nestjs/testing';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import { JobsModule } from '@/jobs/jobs.module';
import { KnowledgeGraphReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-reconciliation.scheduler';
import { KnowledgeGraphSemanticReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-semantic-reconciliation.scheduler';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { SearchResponseSchema } from '@/knowledge-graph/dto/graph-search.dto';
import { KnowledgeGraphDetailService } from '@/knowledge-graph/knowledge-graph-detail.service';
import { KnowledgeGraphEdgeListService } from '@/knowledge-graph/knowledge-graph-edge-list.service';
import { KnowledgeGraphExploreService } from '@/knowledge-graph/knowledge-graph-explore.service';
import { KnowledgeGraphNodeListService } from '@/knowledge-graph/knowledge-graph-node-list.service';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { SemanticGraphExtractor } from '@/knowledge-graph/infrastructure/extraction/semantic-graph-extractor.provider';
import {
  TestSemanticEmbedder,
  TestSemanticExtractor,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';
import { waitForCondition } from '@/testing/wait-for-condition';
import { KnowledgeGraphMcpRegistrar } from '@/mcp/tools/knowledge-graph/knowledge-graph-mcp.registrar';
import { McpKnowledgeScopeResolver } from '@/mcp/tools/knowledge-graph/mcp-knowledge-scope.resolver';

import {
  createRunPrefix,
  KnowledgeGraphHttpFixture,
  refreshPath,
  statusPath,
  type TestAgent,
} from '@test/knowledge-graph/support/knowledge-graph-http.fixture';

const describeA3Flow =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a3' &&
  process.env.NEO4J_URI &&
  process.env.NEO4J_USERNAME &&
  process.env.NEO4J_PASSWORD &&
  process.env.REDIS_QUEUE_URL
    ? describe
    : describe.skip;

describeA3Flow(
  'F8-01 실제 로그인 → P7 fake 색인 → REST·MCP 검색 최신성',
  () => {
    jest.setTimeout(120_000);

    const prefix = createRunPrefix('a3-f801');
    const extractor = new TestSemanticExtractor();
    const embedder = new TestSemanticEmbedder();
    const originalPrefix = process.env.BULLMQ_PREFIX;

    let fixture: KnowledgeGraphHttpFixture;
    let jobs: TestingModule | null = null;
    let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
    let organizationId: string;

    const config = {
      enabled: true,
      semanticEnabled: true,
      query: { enabled: true, graphReadTimeoutMs: 10_000 },
      semanticWorkerConcurrency: 1,
      semanticProviderMaxPerMinute: 1_000,
      quota: {
        refreshActorPerHour: 30,
        refreshOrganizationPerHour: 300,
        searchActorPerMinute: 60,
        searchOrganizationPerMinute: 600,
        rebuildOrganizationPerDay: 3,
      },
      searchEnnMaxSources: 2_000,
      semantic: null,
      url: process.env.NEO4J_URI,
      username: process.env.NEO4J_USERNAME,
      password: process.env.NEO4J_PASSWORD,
      database: process.env.NEO4J_DATABASE || undefined,
    };

    beforeAll(async () => {
      process.env.BULLMQ_PREFIX = `work-os:graph:p8-a3:f801:${randomUUID()}`;
      fixture = await KnowledgeGraphHttpFixture.boot(prefix, configureApi);
      graph = await createNeo4jGraph({
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
        database: process.env.NEO4J_DATABASE || undefined,
      });
      await startJobs();
    });

    afterAll(async () => {
      await stopJobs();
      if (graph && organizationId) {
        await graph.query(
          'MATCH (n) WHERE n.organizationId = $organizationId DETACH DELETE n',
          { organizationId },
        );
        await graph.close();
      }
      await fixture?.close();
      if (originalPrefix === undefined) delete process.env.BULLMQ_PREFIX;
      else process.env.BULLMQ_PREFIX = originalPrefix;
    });

    it('Wiki 저장과 fake 의미 색인 뒤 REST 검색 출처가 현재 owner/generation을 따르고 rename 뒤 stale을 제거한다', async () => {
      const owner = await fixture.createUser('owner');
      organizationId = await fixture.createOrganization(owner, 'main');
      const created = await fixture.createWikiDocument(owner, organizationId, {
        title: 'F8-01 최초 제목',
        contentMarkdown: '지윤은 Neo4j를 사용한다. 검색 최신성을 검증한다.',
      });

      await waitObserved(created.id);
      await owner.agent
        .post(refreshPath(organizationId, created.id))
        .send({})
        .expect(202);
      await waitStatus(owner.agent, created.id, 'up_to_date');

      const first = await owner.agent
        .get(searchPath())
        .query({ q: 'Neo4j', mode: 'semantic', limit: 5 })
        .expect(200);

      expect(first.body.items[0]).toMatchObject({
        source: {
          id: created.id,
          kind: 'wiki_document',
          title: 'F8-01 최초 제목',
        },
        matchedBy: ['semantic'],
      });
      expect(first.body.items[0].semantic.generationId).toEqual(
        expect.any(String),
      );

      const renamed = await owner.agent
        .patch(`/organizations/${organizationId}/wiki/documents/${created.id}`)
        .send({ title: 'F8-01 변경 제목' })
        .expect(200);

      const stale = await owner.agent
        .get(searchPath())
        .query({ q: 'F8-01 변경', mode: 'hybrid', limit: 5 })
        .expect(200);
      expect(stale.body.items).toEqual([
        expect.objectContaining({
          source: expect.objectContaining({
            id: created.id,
            title: 'F8-01 변경 제목',
          }),
          matchedBy: ['keyword'],
          semantic: null,
        }),
      ]);

      await owner.agent
        .post(refreshPath(organizationId, created.id))
        .send({})
        .expect(202);
      await waitStatus(owner.agent, created.id, 'up_to_date');

      const refreshed = await owner.agent
        .get(searchPath())
        .query({ q: 'F8-01 변경', mode: 'hybrid', limit: 5 })
        .expect(200);

      expect(refreshed.body.items[0]).toMatchObject({
        source: {
          id: created.id,
          kind: 'wiki_document',
          title: 'F8-01 변경 제목',
          updatedAt: renamed.body.updatedAt,
        },
        matchedBy: ['semantic', 'keyword'],
      });

      const [knowledgeSearch] = fixture.app
        .get(KnowledgeGraphMcpRegistrar, { strict: false })
        .tools();
      if (!knowledgeSearch)
        throw new Error('knowledge_search MCP 도구가 등록되지 않았습니다.');
      const mcp = SearchResponseSchema.parse(
        await knowledgeSearch.invoke(
          {
            organizationId,
            q: 'F8-01 변경',
            mode: 'hybrid',
            limit: 5,
          },
          {
            authMethod: 'oauth',
            credentialId: null,
            userId: owner.userId,
            clientId: 'f8-01-client',
            scopes: ['wiki:read'],
            allowedOrganizationIds: null,
          },
          async () => undefined,
        ),
      );
      expect(mcp.items).toEqual(refreshed.body.items);
      expect(mcp.items[0]).toMatchObject({
        source: { id: created.id, title: 'F8-01 변경 제목' },
        semantic: {
          generationId: refreshed.body.items[0].semantic.generationId,
        },
      });
      expect(
        extractor.calls.some((text) => text.includes('검색 최신성을 검증한다')),
      ).toBe(true);
      expect(embedder.calls.length).toBeGreaterThan(0);
    });

    function configureApi(builder: TestingModuleBuilder) {
      return (
        builder
          .overrideProvider(knowledgeGraphConfig.KEY)
          .useValue(config)
          .overrideProvider(SemanticEmbedder)
          .useValue(embedder)
          .overrideProvider(McpKnowledgeScopeResolver)
          .useValue({
            allowedNodeKinds: async () => [
              'wiki_document',
              'semantic_entity',
              'curated_node',
            ],
          })
          // A3 flow는 검색 경로만 검증한다. 병렬 A2 read 결선 상태와 분리한다.
          .overrideProvider(KnowledgeGraphDetailService)
          .useValue({})
          .overrideProvider(KnowledgeGraphEdgeListService)
          .useValue({})
          .overrideProvider(KnowledgeGraphExploreService)
          .useValue({})
          .overrideProvider(KnowledgeGraphNodeListService)
          .useValue({})
      );
    }

    async function startJobs() {
      jobs = await Test.createTestingModule({ imports: [JobsModule] })
        .overrideProvider(knowledgeGraphConfig.KEY)
        .useValue(config)
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

    async function waitObserved(documentId: string) {
      const states = fixture.app.get(OutboxSemanticSourceState, {
        strict: false,
      });
      await waitForCondition(
        async () =>
          (
            await states.current({
              organizationId,
              aggregateKind: 'wiki_document',
              aggregateId: documentId,
            })
          )?.state?.observedSeq === 1,
        'F8-01 Jobs가 Wiki 원본을 관측하지 않았습니다.',
        { timeoutMs: 40_000 },
      );
    }

    async function waitStatus(
      agent: TestAgent,
      documentId: string,
      status: string,
    ) {
      await waitForCondition(
        async () =>
          (await agent.get(statusPath(organizationId, documentId))).body
            .status === status,
        `F8-01 status가 ${status}에 도달하지 않았습니다.`,
        { timeoutMs: 40_000 },
      );
    }

    function searchPath() {
      return `/organizations/${organizationId}/knowledge-graph/search`;
    }
  },
);
