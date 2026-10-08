import { randomUUID } from 'node:crypto';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { LangchainNeo4jGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-graph.adapter';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';
import { ProjectProjectionSourceSchema } from '@/projects/domain/project-projection-source';

const describeWritable =
  process.env.KG_TEST_ALLOW_WRITE === '1' && process.env.NEO4J_URI
    ? describe
    : describe.skip;

describeWritable('Neo4j Project의 관계와 공유 column 소유권', () => {
  const organizationId = `kg-project-${randomUUID()}`;
  const projectId = randomUUID();
  const creatorId = randomUUID();
  const leadId = randomUUID();
  const nextLeadId = randomUUID();
  const firstColumnId = randomUUID();
  const secondColumnId = randomUUID();
  const sourceKey = JSON.stringify(['project', organizationId, projectId]);
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let writer: LangchainNeo4jGraphAdapter;

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

  async function cleanup() {
    await graph.query(
      'MATCH (node) WHERE node.organizationId = $organizationId OR (node:KGProjectionSource AND node.key = $sourceKey) DETACH DELETE node',
      { organizationId, sourceKey },
    );
  }
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

  function tracking(version: number, deleted = false) {
    return OutboxAggregateVersionSchema.parse({
      organizationId,
      aggregateKind: 'project',
      aggregateId: projectId,
      desiredSeq: version,
      appliedSeq: 0,
      deleted,
      projectionStatus: 'pending',
      lastAttemptedAt: null,
      appliedAt: null,
      lastError: null,
      updatedAt: new Date(),
    });
  }
  function source(
    leadUserId: string | null = leadId,
    archivedAt: Date | null = null,
  ) {
    return ProjectProjectionSourceSchema.parse({
      id: projectId,
      organizationId,
      key: 'GRAPH',
      name: '그래프 프로젝트',
      createdByUserId: creatorId,
      leadUserId,
      archivedAt,
      updatedAt: new Date(),
      columns: [
        { id: firstColumnId, name: '대기', position: 0, isCompleted: false },
        { id: secondColumnId, name: '완료', position: 1, isCompleted: true },
      ],
    });
  }
  function references() {
    return graph.query(
      `MATCH (project:KGWorkOSProject {key: $sourceKey})-[relation]->(target)
      WHERE type(relation) IN ['KG_PROJECT_ORGANIZATION', 'KG_PROJECT_CREATOR', 'KG_PROJECT_LEAD']
      RETURN type(relation) AS kind, target.sourceId AS id ORDER BY kind`,
      { sourceKey },
    );
  }

  it('조직·작성자·담당자 관계를 만들고 변경과 NULL에서 이전 담당자 연결만 정리한다', async () => {
    await writer.applyProject(tracking(1), source());
    expect(await references()).toEqual([
      { kind: 'KG_PROJECT_CREATOR', id: creatorId },
      { kind: 'KG_PROJECT_LEAD', id: leadId },
      { kind: 'KG_PROJECT_ORGANIZATION', id: organizationId },
    ]);
    await writer.applyProject(tracking(2), source(nextLeadId));
    expect(await references()).toContainEqual({
      kind: 'KG_PROJECT_LEAD',
      id: nextLeadId,
    });
    expect(await references()).not.toContainEqual({
      kind: 'KG_PROJECT_LEAD',
      id: leadId,
    });
    await writer.applyProject(tracking(3), source(null));
    expect(await references()).toEqual([
      { kind: 'KG_PROJECT_CREATOR', id: creatorId },
      { kind: 'KG_PROJECT_ORGANIZATION', id: organizationId },
    ]);
  });

  it('placeholder를 실제 원본으로 바꾸고 column 교체 때 삭제된 column만 비활성화한다', async () => {
    await graph.query(
      'CREATE (:KGWorkOSProject {key: $sourceKey, organizationId: $organizationId, placeholder: true})',
      { sourceKey, organizationId },
    );
    await writer.applyProject(tracking(1), source());
    const current = source();
    current.columns = [{ ...current.columns[0], name: '대기 수정' }];
    await writer.applyProject(tracking(2), current);
    expect(
      await graph.query(
        'MATCH (project:KGWorkOSProject {key: $sourceKey}) RETURN project.placeholder AS placeholder',
        { sourceKey },
      ),
    ).toEqual([{ placeholder: false }]);
    expect(
      await graph.query(
        `MATCH (:KGWorkOSProject {key: $sourceKey})-[:KG_PROJECT_COLUMN]->(column)
      RETURN column.sourceId AS id, column.name AS name, column.placeholder AS placeholder, column.deleted AS deleted`,
        { sourceKey },
      ),
    ).toEqual([
      {
        id: firstColumnId,
        name: '대기 수정',
        placeholder: false,
        deleted: false,
      },
    ]);
    expect(
      await graph.query(
        'MATCH (column:KGWorkOSProjectColumn {organizationId: $organizationId, sourceId: $id}) RETURN column.deleted AS deleted',
        { organizationId, id: secondColumnId },
      ),
    ).toEqual([{ deleted: true }]);
  });

  it('보관·복구와 오래된 버전에서 최신 Project 상태가 유지된다', async () => {
    await writer.applyProject(tracking(1), source());
    await writer.applyProject(
      tracking(2),
      source(leadId, new Date('2026-10-09T00:00:00.000Z')),
    );
    expect(
      await graph.query(
        'MATCH (project:KGWorkOSProject {key: $sourceKey}) RETURN project.archivedAt IS NOT NULL AS archived',
        { sourceKey },
      ),
    ).toEqual([{ archived: true }]);
    await writer.applyProject(tracking(3), source());
    await writer.applyProject(tracking(2), source(null, new Date()));
    expect(
      await graph.query(
        'MATCH (project:KGWorkOSProject {key: $sourceKey}) RETURN project.archivedAt AS archivedAt, project.deleted AS deleted',
        { sourceKey },
      ),
    ).toEqual([{ archivedAt: null, deleted: false }]);
    expect(await references()).toContainEqual({
      kind: 'KG_PROJECT_LEAD',
      id: leadId,
    });
  });

  it('삭제 tombstone은 소유 관계를 정리하고 stale replay로 복구되지 않는다', async () => {
    await writer.applyProject(tracking(1), source());
    await writer.applyProject(tracking(3, true), null);
    await writer.applyProject(tracking(2), source());
    expect(await references()).toEqual([]);
    expect(
      await graph.query(
        'MATCH (project:KGWorkOSProject {key: $sourceKey}) RETURN project.deleted AS deleted',
        { sourceKey },
      ),
    ).toEqual([{ deleted: true }]);
    expect(
      await graph.query(
        'MATCH (:KGWorkOSProject {key: $sourceKey})-[relation:KG_PROJECT_COLUMN]->() RETURN count(relation) AS count',
        { sourceKey },
      ),
    ).toEqual([{ count: '0' }]);
  });

  it('100개 column의 재투영에서 행 증폭 없이 관계 한 개씩을 유지한다', async () => {
    const current = source();
    current.columns = Array.from({ length: 100 }, (_, position) => ({
      id: randomUUID(),
      name: `컬럼 ${position}`,
      position,
      isCompleted: false,
    }));
    await writer.applyProject(tracking(1), current);
    await writer.applyProject(tracking(2), current);
    expect(
      await graph.query(
        'MATCH (:KGWorkOSProject {key: $sourceKey})-[relation:KG_PROJECT_COLUMN]->() RETURN count(relation) AS count',
        { sourceKey },
      ),
    ).toEqual([{ count: '100' }]);
  });
});
