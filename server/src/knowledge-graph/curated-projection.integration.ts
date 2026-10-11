import { randomUUID } from 'node:crypto';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import type { CuratedEdge } from '@/knowledge-graph/domain/curated-graph';
import { LangchainNeo4jGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-graph.adapter';
import {
  curatedEdgeSelectSchema,
  curatedNodeSelectSchema,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-graph.zod';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';
import { ProjectProjectionSourceSchema } from '@/projects/domain/project-projection-source';

describeKnowledgeGraph(
  'Neo4j curated 원본의 종단·관계 소유권과 삭제 경합',
  () => {
    const organizationId = `kg-curated-writer-${randomUUID()}`;
    const nodeId = randomUUID();
    const targetId = randomUUID();
    const thirdId = randomUUID();
    const edgeId = randomUUID();
    const projectId = randomUUID();
    const keys = new Set<string>();
    let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
    let writer: LangchainNeo4jGraphAdapter;

    function key(kind: string, id: string) {
      const value = JSON.stringify([kind, organizationId, id]);
      keys.add(value);
      return value;
    }
    function tracking(
      kind: 'curated_node' | 'curated_edge' | 'project',
      id: string,
      version: number,
      deleted = false,
    ) {
      key(kind, id);
      return OutboxAggregateVersionSchema.parse({
        organizationId,
        aggregateKind: kind,
        aggregateId: id,
        desiredSeq: version,
        appliedSeq: 0,
        deleted,
        projectionStatus: 'pending',
        lastAttemptedAt: null,
        appliedAt: null,
        lastError: null,
        appliedSnapshotDigest: null,
        lastRequeuedAt: null,
        requeueCount: 0,
        updatedAt: new Date(),
      });
    }
    function node(id = nodeId, title = '현재 노드') {
      key('curated_node', id);
      return curatedNodeSelectSchema.parse({
        id,
        organizationId,
        kind: 'concept',
        title,
        properties: { source: '사용자' },
        status: 'active',
        revision: 1,
        createdByUserId: '검증 사용자',
        updatedByUserId: '검증 사용자',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    }
    function edge(
      targetNodeId = targetId,
      targetNodeKind: CuratedEdge['targetNodeKind'] = 'curated_node',
    ) {
      key('curated_node', nodeId);
      key(targetNodeKind, targetNodeId);
      return curatedEdgeSelectSchema.parse({
        id: edgeId,
        organizationId,
        sourceNodeId: nodeId,
        sourceNodeKind: 'curated_node',
        targetNodeId,
        targetNodeKind,
        sourceCuratedNodeId: nodeId,
        targetCuratedNodeId:
          targetNodeKind === 'curated_node' ? targetNodeId : null,
        predicate: 'references',
        directed: true,
        properties: { note: '명시 관계' },
        status: 'active',
        revision: 1,
        createdByUserId: '검증 사용자',
        updatedByUserId: '검증 사용자',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    }
    async function cleanup() {
      await graph.query(
        'MATCH (node) WHERE node.organizationId = $organizationId OR node.key IN $keys DETACH DELETE node',
        { organizationId, keys: [...keys] },
      );
    }
    async function edgeCount() {
      const [row] = await graph.query(
        'MATCH ()-[edge:KG_CURATED_RELATED_TO]->() WHERE edge.organizationId = $organizationId RETURN count(edge) AS total',
        { organizationId },
      );
      return row?.total;
    }
    beforeAll(async () => {
      const config = knowledgeGraphConfig();
      if (!config.url || !config.username || !config.password)
        throw new Error('Neo4j 검증 설정이 없습니다.');
      graph = await createNeo4jGraph({
        url: config.url,
        username: config.username,
        password: config.password,
        database: config.database,
      });
      writer = new LangchainNeo4jGraphAdapter(config);
    });
    beforeEach(async () => {
      await cleanup();
    });
    afterAll(async () => {
      try {
        if (graph) await cleanup();
      } finally {
        await writer?.onApplicationShutdown();
        await graph?.close();
      }
    });

    it('동일 이벤트 재전달과 오래된 node 편집은 최신 원본을 덮지 않는다', async () => {
      await writer.applyCuratedNode(
        tracking('curated_node', nodeId, 2),
        node(nodeId, '최신 제목'),
      );
      await Promise.all(
        Array.from({ length: 8 }, () =>
          writer.applyCuratedNode(
            tracking('curated_node', nodeId, 2),
            node(nodeId, '중복 제목'),
          ),
        ),
      );
      await writer.applyCuratedNode(
        tracking('curated_node', nodeId, 1),
        node(nodeId, '오래된 제목'),
      );
      const rows = await graph.query(
        'MATCH (node:KGCuratedNode {key: $key}) RETURN node.title AS title, node.placeholder AS placeholder',
        { key: key('curated_node', nodeId) },
      );
      expect(rows).toEqual([{ title: '최신 제목', placeholder: false }]);
    });

    it('관계 종단 이동과 predicate 편집은 자기 관계 하나만 교체한다', async () => {
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 1),
        edge(),
      );
      await writer.applyCuratedEdge(tracking('curated_edge', edgeId, 2), {
        ...edge(thirdId),
        predicate: 'depends_on',
        revision: 2,
      });
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 1),
        edge(),
      );
      expect(await edgeCount()).toBe('1');
      expect(
        await graph.query(
          'MATCH (source)-[edge:KG_CURATED_RELATED_TO {edgeId: $edgeId}]->(target) RETURN source.sourceId AS sourceId, target.sourceId AS targetId, edge.predicate AS predicate, edge.revision AS revision',
          { edgeId },
        ),
      ).toEqual([
        {
          sourceId: nodeId,
          targetId: thirdId,
          predicate: 'depends_on',
          revision: 2,
        },
      ]);
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 3, true),
        null,
      );
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 2),
        edge(),
      );
      expect(await edgeCount()).toBe('0');
    });

    it('curated node tombstone 뒤 늦은 node·높은 edge 버전도 관계를 부활시키지 않는다', async () => {
      await writer.applyCuratedNode(
        tracking('curated_node', nodeId, 1),
        node(),
      );
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 1),
        edge(),
      );
      await writer.applyCuratedNode(
        tracking('curated_node', nodeId, 2, true),
        null,
      );
      await writer.applyCuratedNode(
        tracking('curated_node', nodeId, 1),
        node(),
      );
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 100),
        edge(),
      );
      expect(await edgeCount()).toBe('0');
      expect(
        await graph.query(
          'MATCH (node:KGCuratedNode {key: $key}) RETURN node.deleted AS deleted',
          { key: key('curated_node', nodeId) },
        ),
      ).toEqual([{ deleted: true }]);
    });

    it('노드가 투영되기 전에 tombstone이 오면 stale edge가 placeholder도 만들지 않는다', async () => {
      await writer.applyCuratedNode(
        tracking('curated_node', nodeId, 4, true),
        null,
      );
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 1),
        edge(),
      );
      expect(await edgeCount()).toBe('0');
      expect(
        await graph.query(
          'MATCH (node:KGCuratedNode {key: $key}) RETURN count(node) AS total',
          { key: key('curated_node', nodeId) },
        ),
      ).toEqual([{ total: '0' }]);
    });

    it('동시에 들어온 종단 삭제와 관계 작성은 tombstone 이후 관계 0으로 수렴한다', async () => {
      await writer.applyCuratedNode(
        tracking('curated_node', nodeId, 1),
        node(),
      );
      await Promise.all([
        writer.applyCuratedNode(
          tracking('curated_node', nodeId, 2, true),
          null,
        ),
        writer.applyCuratedEdge(tracking('curated_edge', edgeId, 1), edge()),
      ]);
      expect(await edgeCount()).toBe('0');
    });

    it('Project 재투영은 명시 curated 관계를 보존하고 사용자 관계는 Project 속성을 바꾸지 않는다', async () => {
      const project = ProjectProjectionSourceSchema.parse({
        id: projectId,
        organizationId,
        key: 'CURATED',
        name: '업무 원본 제목',
        createdByUserId: '검증 사용자',
        leadUserId: null,
        archivedAt: null,
        updatedAt: new Date(),
        columns: [],
      });
      await writer.applyProject(tracking('project', projectId, 1), project);
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 1),
        edge(projectId, 'project'),
      );
      await writer.applyProject(tracking('project', projectId, 2), {
        ...project,
        name: '업무 원본 수정 제목',
      });
      expect(await edgeCount()).toBe('1');
      expect(
        await graph.query(
          'MATCH (node:KGTeamspaceProject {key: $key}) RETURN node.name AS name, node.placeholder AS placeholder',
          { key: key('project', projectId) },
        ),
      ).toEqual([{ name: '업무 원본 수정 제목', placeholder: false }]);
      expect(
        await graph.query(
          'MATCH (:KGTeamspaceProject {key: $key})-[edge:KG_PROJECT_ORGANIZATION]->() RETURN count(edge) AS total',
          { key: key('project', projectId) },
        ),
      ).toEqual([{ total: '1' }]);
      await writer.applyProject(tracking('project', projectId, 3, true), null);
      expect(await edgeCount()).toBe('0');
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 2),
        edge(projectId, 'project'),
      );
      expect(await edgeCount()).toBe('0');
    });

    it('references의 self-loop는 단일 관계로 저장하고 삭제한다', async () => {
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 1),
        edge(nodeId),
      );
      expect(await edgeCount()).toBe('1');
      await writer.applyCuratedEdge(
        tracking('curated_edge', edgeId, 2, true),
        null,
      );
      expect(await edgeCount()).toBe('0');
    });

    it('다른 조직·다른 ID·잘못된 tracking 종류는 외부 쓰기 전에 거부한다', async () => {
      await expect(
        writer.applyCuratedNode(tracking('curated_node', nodeId, 1), {
          ...node(),
          organizationId: '타 조직',
        }),
      ).rejects.toThrow('일치하지');
      await expect(
        writer.applyCuratedEdge(tracking('curated_edge', edgeId, 1), {
          ...edge(),
          id: randomUUID(),
        }),
      ).rejects.toThrow('일치하지');
      await expect(
        writer.applyCuratedNode(tracking('project', nodeId, 1), node()),
      ).rejects.toThrow('일치하지');
      expect(await edgeCount()).toBe('0');
    });
  },
);
