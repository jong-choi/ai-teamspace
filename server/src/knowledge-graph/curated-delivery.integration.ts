import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import {
  member,
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { JobsModule } from '@/jobs/jobs.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { CuratedGraphModule } from '@/knowledge-graph/curated-graph.module';
import { CuratedGraphService } from '@/knowledge-graph/curated-graph.service';
import {
  CuratedGraphNodeConnectedError,
  CuratedGraphRevisionConflictError,
} from '@/knowledge-graph/domain/curated-graph.error';
import { curatedEditAudit } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edit-audit.schema';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { WikiDrizzlePersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { and, eq } from 'drizzle-orm';
import * as Y from 'yjs';

jest.setTimeout(30_000);

describeKnowledgeGraph(
  'curated의 PG 원본 저장과 실제 Redis·Jobs·Neo4j 전달',
  () => {
    const organizationId = `kg-curated-flow-${randomUUID()}`;
    const actorId = `kg-curated-flow-actor-${randomUUID()}`;
    const original = new Map<string, string | undefined>();
    const keys = new Set<string>();
    let api: TestingModule;
    let jobs: TestingModule;
    let database: DatabaseService['db'];
    let curated: CuratedGraphService;
    let wiki: WikiRepository;
    let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;

    function key(kind: string, id: string) {
      const value = JSON.stringify([kind, organizationId, id]);
      keys.add(value);
      return value;
    }
    async function state(id: string) {
      const [row] = await database
        .select()
        .from(outboxAggregateVersion)
        .where(
          and(
            eq(outboxAggregateVersion.organizationId, organizationId),
            eq(outboxAggregateVersion.aggregateId, id),
          ),
        );
      return row;
    }
    async function applied(kind: string, id: string, version: number) {
      key(kind, id);
      await waitForCondition(
        async () => (await state(id))?.appliedSeq === version,
        `curated 버전 ${version}이 실제 투영되지 않았습니다.`,
        { timeoutMs: 15_000 },
      );
    }
    beforeAll(async () => {
      for (const [name, value] of Object.entries({
        KG_PROJECTION_ENABLED: 'true',
        BULLMQ_PREFIX: `kg-curated-flow-${randomUUID()}`,
      })) {
        original.set(name, process.env[name]);
        process.env[name] = value;
      }
      const config = knowledgeGraphConfig();
      if (!config.url || !config.username || !config.password)
        throw new Error('Neo4j 검증 설정이 없습니다.');
      graph = await createNeo4jGraph({
        url: config.url,
        username: config.username,
        password: config.password,
        database: config.database,
      });
      // 원본 저장 application에는 Redis/Jobs module을 넣지 않는다.
      api = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
          CuratedGraphModule,
          WikiDrizzlePersistenceModule,
        ],
      }).compile();
      await api.init();
      database = api.get(DatabaseService).db;
      curated = api.get(CuratedGraphService);
      wiki = api.get(WikiRepository);
      await database.insert(user).values({
        id: actorId,
        name: '사용자 그래프 검증',
        email: `${actorId}@example.com`,
        username: actorId,
      });
      await database.insert(organization).values({
        id: organizationId,
        name: '사용자 그래프 조직',
        slug: organizationId,
        createdAt: new Date(),
      });
      await database.insert(member).values({
        id: randomUUID(),
        organizationId,
        userId: actorId,
        role: 'owner',
        createdAt: new Date(),
      });
    });
    afterAll(async () => {
      try {
        await jobs?.close();
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
            'MATCH (node) WHERE node.organizationId = $organizationId OR node.key IN $keys DETACH DELETE node',
            { organizationId, keys: [...keys] },
          );
      } finally {
        try {
          await api?.close();
          await graph?.close();
        } finally {
          for (const [name, value] of original) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
          }
        }
      }
    });

    it('worker 없는 상태에서 저장한 원본은 pending을 보존하고 Jobs 기동 후 최신 revision으로 수렴한다', async () => {
      const node = await curated.createNode(organizationId, actorId, {
        kind: 'concept',
        title: 'worker 전 저장',
      });
      key('curated_node', node.id);
      const updated = await curated.updateNode(
        organizationId,
        node.id,
        actorId,
        1,
        { title: 'worker 전 최신 수정' },
      );
      expect(updated).toMatchObject({ revision: 2 });
      expect(await state(node.id)).toMatchObject({
        desiredSeq: 2,
        appliedSeq: 0,
        projectionStatus: 'pending',
      });
      expect(
        await graph.query(
          'MATCH (node:KGCuratedNode {key: $key}) RETURN count(node) AS total',
          { key: key('curated_node', node.id) },
        ),
      ).toEqual([{ total: '0' }]);
      jobs = await Test.createTestingModule({
        imports: [JobsModule],
      }).compile();
      await jobs.init();
      await applied('curated_node', node.id, 2);
      expect(
        await graph.query(
          'MATCH (node:KGCuratedNode {key: $key}) RETURN node.title AS title, node.revision AS revision',
          { key: key('curated_node', node.id) },
        ),
      ).toEqual([{ title: 'worker 전 최신 수정', revision: 2 }]);
      await expect(
        curated.updateNode(organizationId, node.id, actorId, 1, {
          title: 'stale 수정',
        }),
      ).rejects.toBeInstanceOf(CuratedGraphRevisionConflictError);
      expect(await state(node.id)).toMatchObject({
        desiredSeq: 2,
        appliedSeq: 2,
      });
    });

    it('관계 종단 수정·연결 수 충돌·관계 삭제·node tombstone은 실제 전체 전달로 반영된다', async () => {
      const source = await curated.createNode(organizationId, actorId, {
        kind: 'topic',
        title: '시작',
      });
      const target = await curated.createNode(organizationId, actorId, {
        kind: 'technology',
        title: '처음 대상',
      });
      const replacement = await curated.createNode(organizationId, actorId, {
        kind: 'reference',
        title: '새 대상',
      });
      const edge = await curated.createEdge(organizationId, actorId, {
        sourceNodeId: source.id,
        targetNodeId: target.id,
        predicate: 'related_to',
        directed: false,
      });
      await applied('curated_edge', edge.id, 1);
      await expect(
        curated.deleteNode(organizationId, source.id, actorId, 1),
      ).rejects.toBeInstanceOf(CuratedGraphNodeConnectedError);
      await curated.updateEdge(organizationId, edge.id, actorId, 1, {
        sourceNodeId: source.id,
        targetNodeId: replacement.id,
        predicate: 'depends_on',
        directed: true,
      });
      await applied('curated_edge', edge.id, 2);
      expect(
        await graph.query(
          'MATCH (source)-[edge:KG_CURATED_RELATED_TO {edgeId: $edgeId}]->(target) RETURN source.sourceId AS sourceId, target.sourceId AS targetId, edge.predicate AS predicate',
          { edgeId: edge.id },
        ),
      ).toEqual([
        {
          sourceId: source.id,
          targetId: replacement.id,
          predicate: 'depends_on',
        },
      ]);
      await curated.deleteEdge(organizationId, edge.id, actorId, 2);
      await applied('curated_edge', edge.id, 3);
      const removed = await curated.deleteNode(
        organizationId,
        source.id,
        actorId,
        1,
      );
      expect(removed).toMatchObject({ revision: 2, status: 'deleted' });
      await applied('curated_node', source.id, 2);
      expect(
        await graph.query(
          'MATCH (node:KGCuratedNode {key: $key}) RETURN node.deleted AS deleted',
          { key: key('curated_node', source.id) },
        ),
      ).toEqual([{ deleted: true }]);
      expect(
        await graph.query(
          'MATCH ()-[edge:KG_CURATED_RELATED_TO {edgeId: $edgeId}]->() RETURN count(edge) AS total',
          { edgeId: edge.id },
        ),
      ).toEqual([{ total: '0' }]);
      const audits = await database
        .select()
        .from(curatedEditAudit)
        .where(eq(curatedEditAudit.targetId, edge.id));
      expect(audits.map(({ operation }) => operation)).toEqual([
        'create',
        'update',
        'delete',
      ]);
      expect(
        audits.every(
          ({ actorUserId, afterDigest }) =>
            actorUserId === actorId && afterDigest !== null,
        ),
      ).toBe(true);
      key('curated_node', target.id);
      key('curated_node', replacement.id);
    });

    it('Wiki 실제 owner 재투영·삭제는 사용자 관계와 owner 원본의 소유권을 구분한다', async () => {
      const doc = new Y.Doc();
      const document = await wiki.createDocument(
        organizationId,
        actorId,
        {
          parentDocumentId: null,
          title: '업무 문서',
          position: 0,
          contentMarkdown: '',
        },
        { encodedState: Y.encodeStateAsUpdate(doc), contentMarkdown: '' },
        1,
      );
      doc.destroy();
      await applied('wiki_document', document.id, 1);
      const source = await curated.createNode(organizationId, actorId, {
        kind: 'concept',
        title: '관련 개념',
      });
      const edge = await curated.createEdge(organizationId, actorId, {
        sourceNodeId: source.id,
        targetNodeId: document.id,
        targetNodeKind: 'wiki_document',
        predicate: 'references',
      });
      await applied('curated_node', source.id, 1);
      await applied('curated_edge', edge.id, 1);
      await wiki.updateDocumentMetadata(organizationId, document.id, actorId, {
        parentDocumentId: null,
        title: '업무 owner가 수정',
        position: 0,
      });
      await applied('wiki_document', document.id, 2);
      expect(
        await graph.query(
          'MATCH (source)-[edge:KG_CURATED_RELATED_TO {edgeId: $edgeId}]->(document:KGWorkOSWikiDocument) RETURN document.title AS title, edge.predicate AS predicate',
          { edgeId: edge.id },
        ),
      ).toEqual([{ title: '업무 owner가 수정', predicate: 'references' }]);
      await wiki.deleteDocument(organizationId, document.id);
      await applied('wiki_document', document.id, 3);
      expect(
        await graph.query(
          'MATCH ()-[edge:KG_CURATED_RELATED_TO {edgeId: $edgeId}]->() RETURN count(edge) AS total',
          { edgeId: edge.id },
        ),
      ).toEqual([{ total: '0' }]);
      await curated.deleteEdge(organizationId, edge.id, actorId, 1);
      await applied('curated_edge', edge.id, 2);
      expect(
        await graph.query(
          'MATCH ()-[edge:KG_CURATED_RELATED_TO {edgeId: $edgeId}]->() RETURN count(edge) AS total',
          { edgeId: edge.id },
        ),
      ).toEqual([{ total: '0' }]);
      expect(
        await graph.query(
          'MATCH (document:KGWorkOSWikiDocument {key: $key}) RETURN document.deleted AS deleted',
          { key: key('wiki_document', document.id) },
        ),
      ).toEqual([{ deleted: true }]);
    });
  },
);
