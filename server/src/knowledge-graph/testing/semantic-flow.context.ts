import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  createNeo4jGraph,
  GraphDocument,
  Node,
  Relationship,
} from '@repo/knowledge-graph';
import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { JobsModule } from '@/jobs/jobs.module';
import { KnowledgeGraphReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-reconciliation.scheduler';
import { KNOWLEDGE_GRAPH_SEMANTIC_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import { KnowledgeGraphSemanticReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-semantic-reconciliation.scheduler';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { SemanticGraphExtractor } from '@/knowledge-graph/infrastructure/extraction/semantic-graph-extractor.provider';
import {
  semanticCorrection,
  semanticCorrectionSource,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/semantic-correction.schema';
import { SemanticStatePersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/semantic-state-persistence.module';
import { SemanticRefreshService } from '@/knowledge-graph/semantic-refresh.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';
import { createRedisOptions } from '@/queue/queue.config';
import { waitForCondition } from '@/testing/wait-for-condition';
import { WikiDrizzlePersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';

import { Document } from '@langchain/core/documents';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';

export const describeSemanticFlow =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.NEO4J_URI &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p7_semantic'
    ? describe
    : describe.skip;

export class TestSemanticExtractor extends SemanticGraphExtractor {
  readonly calls: string[] = [];
  readonly failures = new Map<string, Error>();
  readonly emptyGraphs = new Set<string>();
  readonly beforeExtract = new Map<string, () => Promise<void>>();
  async extract(text: string) {
    this.calls.push(text);
    await this.beforeExtract.get(text)?.();
    const failure = this.failures.get(text);
    if (failure) throw failure;
    if (this.emptyGraphs.has(text))
      return new GraphDocument({
        nodes: [],
        relationships: [],
        source: new Document({ pageContent: text }),
      });
    const source = new Node({ id: '지윤', type: 'Person' });
    const target = new Node({ id: 'Neo4j', type: 'Technology' });
    return new GraphDocument({
      nodes: [source, target],
      relationships: [new Relationship({ source, target, type: 'USES' })],
      source: new Document({ pageContent: text }),
    });
  }
}

export class TestSemanticEmbedder extends SemanticEmbedder {
  readonly calls: string[][] = [];
  private vector() {
    return [1, ...Array.from({ length: 767 }, () => 0)];
  }
  async embedDocuments(texts: readonly string[]) {
    this.calls.push([...texts]);
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

export function createSemanticFlowContext(liveProviders = false) {
  const org = `p7-flow-${randomUUID()}`;
  const actor = `p7-flow-actor-${randomUUID()}`;
  const additionalActors = new Set<string>();
  const additionalOrganizations = new Set<string>();
  const extractor = new TestSemanticExtractor();
  const embedder = new TestSemanticEmbedder();
  let app: TestingModule;
  let database: DatabaseService['db'];
  let wiki: WikiRepository;
  let refresh: SemanticRefreshService;
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let queue: Queue;
  const contexts = new Set<TestingModule>();
  const originalPrefix = process.env.BULLMQ_PREFIX;

  beforeAll(async () => {
    process.env.BULLMQ_PREFIX = `kg-p7-flow-${randomUUID()}`;
    app = await startJobs();
    database = app.get(DatabaseService).db;
    wiki = app.get(WikiRepository);
    refresh = app.get(SemanticRefreshService);
    await database.insert(user).values({
      id: actor,
      name: '의미 전체 흐름',
      email: `${actor}@example.test`,
    });
    await database.insert(organization).values({
      id: org,
      slug: org,
      name: '의미 흐름 조직',
      createdAt: new Date(),
    });
    const url = process.env.NEO4J_URI;
    const username = process.env.NEO4J_USERNAME;
    const password = process.env.NEO4J_PASSWORD;
    const redis = process.env.REDIS_QUEUE_URL;
    if (!url || !username || !password || !redis)
      throw new Error('격리 연결 설정이 없습니다.');
    graph = await createNeo4jGraph({ url, username, password });
    queue = new Queue(KNOWLEDGE_GRAPH_SEMANTIC_QUEUE, {
      connection: createRedisOptions(redis),
      prefix: process.env.BULLMQ_PREFIX,
    });
  });
  async function startJobs() {
    const builder = Test.createTestingModule({
      imports: [
        JobsModule,
        WikiDrizzlePersistenceModule,
        SemanticStatePersistenceModule,
      ],
      providers: [SemanticRefreshService],
    });
    if (!liveProviders) {
      builder.overrideProvider(SemanticGraphExtractor).useValue(extractor);
      builder.overrideProvider(SemanticEmbedder).useValue(embedder);
    }
    const next = await builder.compile();
    contexts.add(next);
    await next.init();
    await next.get(KnowledgeGraphReconciliationScheduler).onModuleDestroy();
    await next
      .get(KnowledgeGraphSemanticReconciliationScheduler)
      .onModuleDestroy();
    return next;
  }
  async function restartJobs() {
    for (const relay of app.get(OutboxRelay, { each: true }))
      await relay.stop();
    await app.close();
    contexts.delete(app);
    app = await startJobs();
    database = app.get(DatabaseService).db;
    wiki = app.get(WikiRepository);
    refresh = app.get(SemanticRefreshService);
    return app;
  }
  afterAll(async () => {
    for (const active of contexts) {
      for (const relay of active.get(OutboxRelay, { each: true }))
        await relay.stop();
      await active.close();
    }
    if (queue) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    if (graph) {
      await graph.query(
        'MATCH (n) WHERE n.organizationId IN $organizations OR (n:KGProjectionSource AND any(org IN $organizations WHERE n.key CONTAINS org)) DETACH DELETE n',
        { organizations: [org, ...additionalOrganizations] },
      );
      await graph.close();
    }
    // app의 pool은 close됐다. 정리는 별도의 소유 context에서 같은 조직 범위만 수행한다.
    if (database) {
      const cleanup = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [databaseConfig],
            ignoreEnvFile: true,
          }),
          OutboxInfrastructureModule,
        ],
      }).compile();
      try {
        const db = cleanup.get(DatabaseService).db;
        await db
          .delete(semanticCorrection)
          .where(eq(semanticCorrection.organizationId, org));
        await db
          .delete(semanticCorrectionSource)
          .where(eq(semanticCorrectionSource.organizationId, org));
        await db
          .delete(outboxAggregateVersion)
          .where(eq(outboxAggregateVersion.organizationId, org));
        await db.delete(organization).where(eq(organization.id, org));
        for (const additional of additionalOrganizations) {
          await db
            .delete(semanticCorrection)
            .where(eq(semanticCorrection.organizationId, additional));
          await db
            .delete(semanticCorrectionSource)
            .where(eq(semanticCorrectionSource.organizationId, additional));
          await db
            .delete(outboxAggregateVersion)
            .where(eq(outboxAggregateVersion.organizationId, additional));
          await db.delete(organization).where(eq(organization.id, additional));
        }
        await db.delete(user).where(eq(user.id, actor));
        for (const additional of additionalActors)
          await db.delete(user).where(eq(user.id, additional));
      } finally {
        await cleanup.close();
      }
    }
    if (originalPrefix === undefined) delete process.env.BULLMQ_PREFIX;
    else process.env.BULLMQ_PREFIX = originalPrefix;
  });
  async function indexed(
    documentId: string,
    manualSeq: number,
    timeoutMs = 40_000,
    organizationId = org,
  ) {
    await waitForCondition(
      async () => {
        const current = await app.get(OutboxSemanticSourceState).current({
          organizationId,
          aggregateKind: 'wiki_document',
          aggregateId: documentId,
        });
        return (
          current?.state?.indexedManualSeq === manualSeq &&
          current.state.indexedSeq === current.version.desiredSeq &&
          current.state.activeGenerationId !== null
        );
      },
      '수동 의미 세대가 활성화되지 않았습니다.',
      { timeoutMs },
    );
  }
  async function createWiki(title: string, text: string, organizationId = org) {
    const doc = new Y.Doc();
    try {
      doc.getText('markdown').insert(0, text);
      return await wiki.createDocument(
        organizationId,
        actor,
        { title, position: 0, parentDocumentId: null, contentMarkdown: text },
        { encodedState: Y.encodeStateAsUpdate(doc), contentMarkdown: text },
        1,
      );
    } finally {
      doc.destroy();
    }
  }
  async function createActor() {
    const id = `p7-flow-actor-${randomUUID()}`;
    await database.insert(user).values({
      id,
      name: '동시 수동 요청 사용자',
      email: `${id}@example.test`,
    });
    additionalActors.add(id);
    return id;
  }
  async function createAdditionalOrganization() {
    const id = `p7-flow-additional-${randomUUID()}`;
    additionalOrganizations.add(id);
    await database.insert(organization).values({
      id,
      slug: id,
      name: '의미 교차 조직 검증',
      createdAt: new Date(),
    });
    return id;
  }
  async function replaceWikiBody(documentId: string, text: string) {
    const current = await wiki.loadCollaborationState(org, documentId);
    if (!current) throw new Error('공동편집 원본이 없습니다.');
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, current.collaborationState);
      doc.getText('markdown').delete(0, doc.getText('markdown').length);
      doc.getText('markdown').insert(0, text);
      return await wiki.persistCollaborationSnapshot(
        org,
        documentId,
        { encodedState: Y.encodeStateAsUpdate(doc), contentMarkdown: text },
        actor,
        [actor],
        1,
        false,
      );
    } finally {
      doc.destroy();
    }
  }

  return {
    get org() {
      return org;
    },
    get actor() {
      return actor;
    },
    get extractor() {
      return extractor;
    },
    get embedder() {
      return embedder;
    },
    get app() {
      return app;
    },
    get database() {
      return database;
    },
    get wiki() {
      return wiki;
    },
    get refresh() {
      return refresh;
    },
    get graph() {
      return graph;
    },
    get queue() {
      return queue;
    },
    indexed,
    createWiki,
    createActor,
    createAdditionalOrganization,
    replaceWikiBody,
    startJobs,
    restartJobs,
  };
}
