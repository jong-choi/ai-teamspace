import { randomUUID } from 'node:crypto';

import { OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import { JobsModule } from '@/jobs/jobs.module';
import { KnowledgeGraphJobsModule } from '@/jobs/knowledge-graph/knowledge-graph-jobs.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphProjectionService } from '@/knowledge-graph/knowledge-graph-projection.service';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { WikiDrizzlePersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';
import { WikiProjectionQueryService } from '@/wiki/wiki-projection-query.service';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { and, eq } from 'drizzle-orm';
import * as Y from 'yjs';

describeKnowledgeGraph('Wiki의 PG commit과 실제 Jobs·Neo4j 투영', () => {
  const organizationId = `kg-wiki-flow-${randomUUID()}`;
  const actorId = `kg-wiki-flow-actor-${randomUUID()}`;
  const original = new Map<string, string | undefined>();
  const keys = new Set<string>();
  let app: TestingModule;
  let database: DatabaseService['db'];
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let wiki: WikiRepository;

  beforeAll(async () => {
    for (const [key, value] of Object.entries({
      KG_PROJECTION_ENABLED: 'true',
      BULLMQ_PREFIX: `kg-wiki-flow-${randomUUID()}`,
    })) {
      original.set(key, process.env[key]);
      process.env[key] = value;
    }
    const config = await knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('검증 Neo4j 설정이 없습니다.');
    graph = await createNeo4jGraph({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database,
    });
    app = await Test.createTestingModule({
      imports: [JobsModule, WikiDrizzlePersistenceModule],
    }).compile();
    await app.init();
    database = app.get(DatabaseService).db;
    wiki = app.get(WikiRepository);
    await database.insert(user).values({
      id: actorId,
      name: 'Wiki 흐름 검증',
      email: `${actorId}@example.com`,
      username: actorId,
    });
    await database.insert(organization).values({
      id: organizationId,
      name: 'Wiki 흐름 조직',
      slug: organizationId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    try {
      if (database) {
        await database
          .delete(outboxAggregateVersion)
          .where(eq(outboxAggregateVersion.organizationId, organizationId));
        await database
          .delete(organization)
          .where(eq(organization.id, organizationId));
        await database.delete(user).where(eq(user.id, actorId));
      }
      if (graph)
        await graph.query(
          `MATCH (node)
        WHERE node.organizationId = $organizationId OR (node:KGProjectionSource AND node.key IN $keys)
        DETACH DELETE node`,
          { organizationId, keys: [...keys] },
        );
    } finally {
      try {
        await app?.close();
        await graph?.close();
      } finally {
        for (const [key, value] of original) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

  async function create(title: string, parentDocumentId: string | null = null) {
    const doc = new Y.Doc();
    const source = await wiki.createDocument(
      organizationId,
      actorId,
      {
        parentDocumentId,
        title,
        position: 0,
        contentMarkdown: '',
      },
      { encodedState: Y.encodeStateAsUpdate(doc), contentMarkdown: '' },
      1,
    );
    keys.add(JSON.stringify(['wiki_document', organizationId, source.id]));
    return source;
  }

  async function applied(id: string, version: number) {
    await waitForCondition(
      async () => {
        const [state] = await database
          .select()
          .from(outboxAggregateVersion)
          .where(
            and(
              eq(outboxAggregateVersion.organizationId, organizationId),
              eq(outboxAggregateVersion.aggregateId, id),
            ),
          );
        return state?.appliedSeq === version;
      },
      `Wiki 버전 ${version}의 실제 투영을 확인하지 못했습니다.`,
      { timeoutMs: 15_000 },
    );
  }

  async function read(id: string) {
    return graph.query(
      `MATCH (node:KGWorkOSWikiDocument {key: $key})
      MATCH (marker:KGProjectionSource {key: $key})
      OPTIONAL MATCH (node)-[:KG_WIKI_PARENT]->(parent)
      RETURN node.title AS title, node.deleted AS deleted, marker.appliedSeq AS version,
        collect(parent.sourceId) AS parents`,
      { key: JSON.stringify(['wiki_document', organizationId, id]) },
    );
  }

  it('생성·metadata 변경·삭제는 실제 owner→Outbox→Redis→Jobs→Neo4j로 반영된다', async () => {
    const parent = await create('부모');
    const child = await create('하위', parent.id);
    await applied(parent.id, 1);
    await applied(child.id, 1);
    expect(await read(child.id)).toEqual([
      { title: '하위', deleted: false, version: 1, parents: [parent.id] },
    ]);
    await wiki.updateDocumentMetadata(organizationId, child.id, actorId, {
      parentDocumentId: null,
      title: '이동',
      position: 1,
    });
    await applied(child.id, 2);
    expect(await read(child.id)).toEqual([
      { title: '이동', deleted: false, version: 2, parents: [] },
    ]);
    await wiki.deleteDocument(organizationId, child.id);
    await applied(child.id, 3);
    expect(await read(child.id)).toEqual([
      { title: null, deleted: true, version: 3, parents: [] },
    ]);
  });

  it('Neo4j 성공 후 PG 확인 실패를 재시도해 같은 최신 node 하나로 수렴한다', async () => {
    const confirm = jest
      .spyOn(
        app
          .select(KnowledgeGraphJobsModule)
          .get(OutboxAggregateProjectionState, { strict: true }),
        'markApplied',
      )
      .mockRejectedValueOnce(new Error('PG 확인 장애'));
    const source = await create('확인 재시도');
    await applied(source.id, 1);
    expect(confirm.mock.calls.length).toBeGreaterThanOrEqual(2);
    confirm.mockRestore();
    expect(await read(source.id)).toEqual([
      { title: '확인 재시도', deleted: false, version: 1, parents: [] },
    ]);
    await app.get(KnowledgeGraphProjectionService).applySourceEvent({
      organizationId,
      aggregateKind: 'wiki_document',
      aggregateId: source.id,
      operation: 'changed',
      sourceVersion: 1,
      occurredAt: source.updatedAt.toISOString(),
    });
    expect(await read(source.id)).toEqual([
      { title: '확인 재시도', deleted: false, version: 1, parents: [] },
    ]);
  });

  it.each(['changed', 'removed'])(
    '원본 조회 중 실제 PG %s 변경은 이전 snapshot 쓰기를 차단한다',
    async (operation) => {
      const source = await create(`조회 경합 ${operation}`);
      await applied(source.id, 1);
      const relay = app
        .get(OutboxRelay, { each: true })
        .find((item) => item.running);
      if (!relay) throw new Error('활성 Jobs relay가 없습니다.');
      await relay.stop();
      const query = app.get(WikiProjectionQueryService);
      const current = query.current.bind(query);
      try {
        await wiki.updateDocumentMetadata(organizationId, source.id, actorId, {
          title: '조회 시작',
          position: 0,
          parentDocumentId: null,
        });
        const readSnapshot = jest
          .spyOn(query, 'current')
          .mockImplementationOnce(async (...args) => {
            const snapshot = await current(...args);
            if (operation === 'removed')
              await wiki.deleteDocument(organizationId, source.id);
            else
              await wiki.updateDocumentMetadata(
                organizationId,
                source.id,
                actorId,
                {
                  title: '조회 중 최신 제목',
                  position: 1,
                  parentDocumentId: null,
                },
              );
            return snapshot;
          });
        const event = {
          organizationId,
          aggregateKind: 'wiki_document',
          aggregateId: source.id,
          operation: 'changed',
          sourceVersion: 2,
          occurredAt: source.updatedAt.toISOString(),
        };
        await expect(
          app.get(KnowledgeGraphProjectionService).applySourceEvent(event),
        ).rejects.toThrow('원본 조회 중 그래프 버전');
        readSnapshot.mockRestore();
        expect(await read(source.id)).toEqual([
          {
            title: `조회 경합 ${operation}`,
            deleted: false,
            version: 1,
            parents: [],
          },
        ]);
        await app.get(KnowledgeGraphProjectionService).applySourceEvent(event);
        await applied(source.id, 3);
        expect(await read(source.id)).toEqual([
          {
            title: operation === 'removed' ? null : '조회 중 최신 제목',
            deleted: operation === 'removed',
            version: 3,
            parents: [],
          },
        ]);
      } finally {
        jest.restoreAllMocks();
        relay.start();
      }
    },
  );
});
