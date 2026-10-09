import { randomUUID } from 'node:crypto';

import {
  createNeo4jGraph,
  Neo4jGraph,
  Neo4jVectorStore,
} from '@repo/knowledge-graph';
import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import { databaseSchema } from '@/database/schema';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { graphSourceKey } from '@/knowledge-graph/domain/graph-source-key';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { GraphOwnerReadService } from '@/knowledge-graph/graph-owner-read.service';
import { LangchainNeo4jGraphStructureReaderAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-graph-structure-reader.adapter';
import { CuratedGraphQueryDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/curated-graph-query.repository';
import { curatedEdge } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edge.schema';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';
import { OutboxProjectionFreshnessAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-projection-freshness.adapter';
import type { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import {
  READ_SEMANTIC_ENTITIES_FOR_SCOPES,
  READ_STRUCTURE_EDGES,
  READ_STRUCTURE_NEIGHBORS,
} from '@/knowledge-graph/knowledge-graph-read-queries';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { outboxSemanticSourceState } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

describeKnowledgeGraph('N8-03·04·05·08·09 A2 구조 조회 통합', () => {
  jest.setTimeout(90_000);

  const organizationId = `p8a2-reader-${randomUUID()}`;
  const actorUserId = `p8a2-user-${randomUUID()}`;
  const projectId = randomUUID();
  const projectKey = graphSourceKey('project', organizationId, projectId);
  const memberIds = Array.from({ length: 24 }, () => randomUUID());
  const memberKeys = memberIds.map((id) =>
    graphSourceKey('user_reference', organizationId, id),
  );
  const ticketIds = Array.from({ length: 12 }, () => randomUUID());
  const ticketKeys = ticketIds.map((id) =>
    graphSourceKey('ticket', organizationId, id),
  );

  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof databaseSchema>>;
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let reader: LangchainNeo4jGraphStructureReaderAdapter;
  let semanticState: OutboxSemanticSourceState;
  let projectionState: OutboxAggregateProjectionState;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema: databaseSchema });
    const config = knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('A2 Neo4j 연결 설정이 없습니다.');

    graph = await createNeo4jGraph({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database,
    });
    reader = new LangchainNeo4jGraphStructureReaderAdapter(config);
    semanticState = new OutboxSemanticSourceState({
      db,
    } as DatabaseService);
    projectionState = new OutboxAggregateProjectionState({
      db,
    } as DatabaseService);

    await db.insert(user).values({
      id: actorUserId,
      name: 'A2 검증 사용자',
      email: `${actorUserId}@example.com`,
    });
    await db.insert(organization).values({
      id: organizationId,
      name: 'A2 검증 조직',
      slug: organizationId,
      createdAt: new Date(),
    });

    await graph.query(
      `
      CREATE (project:KGWorkOSProject {
        key: $projectKey,
        organizationId: $organizationId,
        sourceId: $projectId,
        name: 'A2 프로젝트',
        deleted: false
      })
      WITH project
      UNWIND $members AS member
      CREATE (user:KGWorkOSUserReference {
        key: member.key,
        organizationId: $organizationId,
        sourceId: member.id,
        name: member.name,
        deleted: false
      })
      CREATE (project)-[:KG_PROJECT_LEAD]->(user)
      `,
      {
        projectKey,
        projectId,
        organizationId,
        members: memberIds.map((id, index) => ({
          id,
          key: memberKeys[index],
          name: `A2 사용자 ${index}`,
        })),
      },
    );
    await graph.query(
      `
      MATCH (project:KGWorkOSProject {key: $projectKey})
      UNWIND $tickets AS ticket
      CREATE (node:KGWorkOSTicket {
        key: ticket.key,
        organizationId: $organizationId,
        sourceId: ticket.id,
        title: ticket.title,
        deleted: false
      })
      CREATE (node)-[:KG_TICKET_PROJECT]->(project)
      `,
      {
        projectKey,
        organizationId,
        tickets: ticketIds.map((id, index) => ({
          id,
          key: ticketKeys[index],
          title: `A2 티켓 ${index}`,
        })),
      },
    );
    await graph.query(
      `CREATE (:KGProjectionSource {
        key: $projectKey,
        organizationId: $organizationId,
        sourceId: $projectId
      })`,
      { projectKey, projectId, organizationId },
    );
  });

  afterAll(async () => {
    try {
      await db
        .delete(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.organizationId, organizationId));
      await db.delete(organization).where(eq(organization.id, organizationId));
      await db.delete(user).where(eq(user.id, actorUserId));
      await graph.query(
        `MATCH (node)
         WHERE node.organizationId = $organizationId
         DETACH DELETE node`,
        { organizationId },
      );
    } finally {
      await reader?.onApplicationShutdown();
      await graph?.close();
      await pool?.end();
    }
  });

  it('진단: A2 read Cypher를 실제 Neo4j가 파싱한다', async () => {
    await graph.query(READ_STRUCTURE_NEIGHBORS, {
      organizationId,
      frontierKeys: [projectKey],
      relations: ['KG_PROJECT_LEAD'],
      perNodeLimit: 3,
    });
    await graph.query(READ_STRUCTURE_EDGES, {
      organizationId,
      relations: ['KG_PROJECT_LEAD'],
      afterType: null,
      afterSourceKey: '',
      afterTargetKey: '',
      limit: 3,
    });
    await graph.query(READ_SEMANTIC_ENTITIES_FOR_SCOPES, {
      organizationId,
      scopes: [],
      q: null,
      afterTitle: null,
      afterKey: '',
      limit: 3,
    });
  });

  it('N8-03 label 고정·marker 제외·2-hop·high-degree 상한이며 hop마다 Neo4j query 1회만 실행한다', async () => {
    const querySpy = jest.spyOn(Neo4jGraph.prototype, 'query');
    try {
      const result = await reader.expand({
        organizationId,
        focusNodeId: projectKey,
        depth: 2,
        maxNodes: 20,
        maxEdges: 20,
        maxFrontier: 5,
        maxHopCandidates: 8,
      });

      const neighborCalls = querySpy.mock.calls.filter(([query]) =>
        String(query).includes('UNWIND $frontierKeys AS frontierKey'),
      );
      expect(neighborCalls).toHaveLength(2);
      expect(result.nodes.length).toBeLessThanOrEqual(20);
      expect(result.edges.length).toBeLessThanOrEqual(20);
      expect(result.truncated).toBe(true);
      expect(result.nodes).toContainEqual(
        expect.objectContaining({
          id: projectKey,
          kind: 'project',
          sourceId: projectId,
        }),
      );
      expect(
        result.nodes.some(
          (node) => node.kind === ('projection_source' as never),
        ),
      ).toBe(false);

      const detail = await reader.nodeDetail({
        organizationId,
        nodeId: projectKey,
      });
      expect(detail).toMatchObject({
        kind: 'project',
        sourceId: projectId,
      });
    } finally {
      querySpy.mockRestore();
    }
  });

  it('N8-03 graph 조회 실패는 KG_GRAPH_UNAVAILABLE로 fail-closed 한다', async () => {
    const failing = new LangchainNeo4jGraphStructureReaderAdapter({
      ...knowledgeGraphConfig(),
      url: undefined,
      username: undefined,
      password: undefined,
    });
    await expect(
      failing.nodeDetail({ organizationId, nodeId: projectKey }),
    ).rejects.toMatchObject({
      code: 'KG_GRAPH_UNAVAILABLE',
      kind: 'unavailable',
    });
    await expect(
      failing.nodeDetail({ organizationId, nodeId: projectKey }),
    ).rejects.toMatchObject({ code: 'KG_GRAPH_UNAVAILABLE' });
  });

  it('N8-04 PostgreSQL active generation scope만 semantic entity 목록에 포함한다', async () => {
    const sourceId = randomUUID();
    const activeGenerationId = randomUUID();
    const inactiveGenerationId = randomUUID();
    const updatedAt = new Date();

    await db.insert(outboxAggregateVersion).values({
      organizationId,
      aggregateKind: 'wiki_document',
      aggregateId: sourceId,
      desiredSeq: 1,
      appliedSeq: 1,
      projectionStatus: 'applied',
      updatedAt,
    });
    await db.insert(outboxSemanticSourceState).values({
      organizationId,
      aggregateKind: 'wiki_document',
      aggregateId: sourceId,
      observedSeq: 1,
      observedAt: updatedAt,
      indexedSeq: 1,
      indexedSignature: 'a'.repeat(64),
      indexedSourceUpdatedAt: updatedAt,
      indexedFingerprint: semanticPipelineFingerprint,
      activeGenerationId,
      lastIndexedAt: updatedAt,
    });
    await graph.query(
      `
      UNWIND $rows AS row
      CREATE (:KGSemanticEntity {
        key: row.key,
        organizationId: $organizationId,
        sourceKind: 'wiki_document',
        sourceId: $sourceId,
        generationId: row.generationId,
        normalizedName: row.name,
        localId: row.name,
        evidenceDigest: row.digest
      })
      `,
      {
        organizationId,
        sourceId,
        rows: [
          {
            key: `p8a2-active-${randomUUID()}`,
            generationId: activeGenerationId,
            name: 'active-only',
            digest: 'b'.repeat(64),
          },
          {
            key: `p8a2-inactive-${randomUUID()}`,
            generationId: inactiveGenerationId,
            name: 'inactive-hidden',
            digest: 'c'.repeat(64),
          },
        ],
      },
    );

    const searchable = await semanticState.listSearchableSources(
      organizationId,
      semanticPipelineFingerprint,
      100,
    );
    const rows = await reader.listSemanticEntities({
      organizationId,
      scopes: searchable.flatMap((row) =>
        row.activeGenerationId
          ? [
              {
                sourceId: row.aggregateId,
                generationId: row.activeGenerationId,
              },
            ]
          : [],
      ),
      limit: 100,
    });

    expect(rows.map((row) => row.title)).toContain('active-only');
    expect(rows.map((row) => row.title)).not.toContain('inactive-hidden');
  });

  it('N8-05 pending owner 관계는 제외되고 PG curated overlay는 Neo4j와 독립적으로 조회된다', async () => {
    await db
      .insert(outboxAggregateVersion)
      .values({
        organizationId,
        aggregateKind: 'project',
        aggregateId: projectId,
        desiredSeq: 2,
        appliedSeq: 1,
        projectionStatus: 'pending',
      })
      .onConflictDoUpdate({
        target: [
          outboxAggregateVersion.organizationId,
          outboxAggregateVersion.aggregateKind,
          outboxAggregateVersion.aggregateId,
        ],
        set: {
          desiredSeq: 2,
          appliedSeq: 1,
          projectionStatus: 'pending',
          deleted: false,
        },
      });

    const candidates = await reader.listStructuralEdges({
      organizationId,
      relation: 'project_lead',
      limit: 3,
    });
    expect(candidates.length).toBeGreaterThan(0);

    const snapshots = {
      wikiForGraph: async () => [],
      wikiSemantic: async () => [],
      wikiKeyword: async () => [],
      listWiki: async () => [],
      projectsForGraph: async (_org: string, ids: readonly string[]) =>
        ids.map((id) => ({
          id,
          organizationId,
          name: 'A2 프로젝트',
          updatedAt: new Date(),
        })),
      listProjects: async () => [],
      ticketsForGraph: async () => [],
      listTickets: async () => [],
      meetingsForGraph: async () => [],
      listMeetings: async () => [],
      membersForGraph: async (
        _actor: unknown,
        _org: string,
        ids: readonly string[],
      ) =>
        ids.map((id) => ({
          id: `member-${id}`,
          organizationId,
          userId: id,
          role: 'member',
          createdAt: new Date().toISOString(),
          user: {
            id,
            name: `A2 사용자 ${id}`,
            email: `${id}@example.com`,
            image: null,
          },
        })),
    } as unknown as GraphSourceSnapshotProvider;
    const freshness = new OutboxProjectionFreshnessAdapter(projectionState);
    const owners = new GraphOwnerReadService(snapshots, freshness);

    expect(
      await owners.structuralEdges(
        { userId: actorUserId },
        organizationId,
        candidates.slice(0, 1),
        'complete',
      ),
    ).toEqual({ items: [], projectionPending: true });

    await db
      .update(outboxAggregateVersion)
      .set({ appliedSeq: 2, projectionStatus: 'applied' })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, 'project'),
          eq(outboxAggregateVersion.aggregateId, projectId),
        ),
      );
    const fresh = await owners.structuralEdges(
      { userId: actorUserId },
      organizationId,
      candidates.slice(0, 1),
      'complete',
    );
    expect(fresh.projectionPending).toBe(false);
    expect(fresh.items).toHaveLength(1);

    const [leftId, rightId] = [randomUUID(), randomUUID()];
    await db.insert(curatedNode).values([
      {
        id: leftId,
        organizationId,
        kind: 'concept',
        title: 'PG 전용 왼쪽',
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
      {
        id: rightId,
        organizationId,
        kind: 'concept',
        title: 'PG 전용 오른쪽',
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    ]);
    await db.insert(curatedEdge).values({
      organizationId,
      sourceNodeId: leftId,
      targetNodeId: rightId,
      sourceNodeKind: 'curated_node',
      targetNodeKind: 'curated_node',
      predicate: 'related_to',
      directed: false,
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    });
    const curatedRepository = new CuratedGraphQueryDrizzleRepository({
      db,
    } as DatabaseService);
    expect(
      await curatedRepository.listConnectedEdges(organizationId, leftId, 10),
    ).toHaveLength(1);
    expect(
      await graph.query(
        'MATCH (n:KGCuratedNode {organizationId: $organizationId}) RETURN count(n) AS count',
        { organizationId },
      ),
    ).toEqual([{ count: '0' }]);
  });

  it('N8-08 structural edge keyset 전체 순회에서 중복·누락이 없다', async () => {
    const seen = new Set<string>();
    let after: {
      relation: 'project_lead';
      sourceNodeId: string;
      targetNodeId: string;
    } | null = null;

    while (true) {
      const page = await reader.listStructuralEdges({
        organizationId,
        relation: 'project_lead',
        after,
        limit: 7,
      });
      if (!page.length) break;
      for (const row of page) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
      const last = page[page.length - 1]!;
      after = {
        relation: 'project_lead',
        sourceNodeId: last.sourceNodeId,
        targetNodeId: last.targetNodeId,
      };
      if (page.length < 7) break;
    }

    expect(seen.size).toBe(memberIds.length);
  });

  it('N8-09 reader shutdown은 graph 연결을 닫고 VectorStore를 초기화하지 않는다', async () => {
    const vectorSpy = jest.spyOn(Neo4jVectorStore, 'fromExistingIndex');
    const closeSpy = jest.spyOn(Neo4jGraph.prototype, 'close');
    const ownReader = new LangchainNeo4jGraphStructureReaderAdapter(
      knowledgeGraphConfig(),
    );
    const closedBefore = closeSpy.mock.calls.length;
    try {
      expect(
        await ownReader.nodeDetail({ organizationId, nodeId: projectKey }),
      ).toMatchObject({ kind: 'project' });
      expect(vectorSpy).not.toHaveBeenCalled();
      await ownReader.onApplicationShutdown();
      expect(closeSpy.mock.calls.length).toBe(closedBefore + 1);
      await ownReader.onApplicationShutdown();
      expect(closeSpy.mock.calls.length).toBe(closedBefore + 1);
    } finally {
      vectorSpy.mockRestore();
      closeSpy.mockRestore();
    }
  });

  it('P6 structural key unique constraint와 허용 label이 존재한다', async () => {
    const rows = await graph.query(
      `SHOW CONSTRAINTS
       YIELD name, labelsOrTypes, properties
       WHERE properties = ['key']
       RETURN name, labelsOrTypes, properties`,
    );
    const labels = new Set(
      rows.flatMap((row) =>
        Array.isArray(row.labelsOrTypes) ? row.labelsOrTypes.map(String) : [],
      ),
    );
    for (const label of [
      'KGWorkOSWikiDocument',
      'KGWorkOSProject',
      'KGWorkOSTicket',
      'KGWorkOSMeeting',
      'KGWorkOSUserReference',
      'KGCuratedNode',
    ]) {
      expect(labels.has(label)).toBe(true);
    }
  });
});
