import { randomUUID } from 'node:crypto';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { LangchainNeo4jGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-graph.adapter';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';
import { WikiProjectionSourceSchema } from '@/wiki/domain/wiki-projection-source';

const enabled =
  process.env.KG_TEST_ALLOW_WRITE === '1' && Boolean(process.env.NEO4J_URI);
const describeWritable = enabled ? describe : describe.skip;

describeWritable('Neo4j Community의 Wiki 원본 fencing', () => {
  const organizationId = `kg-wiki-${randomUUID()}`;
  const otherOrganizationId = `kg-wiki-other-${randomUUID()}`;
  const documentId = randomUUID();
  const parentA = randomUUID();
  const parentB = randomUUID();
  const collectionId = randomUUID();
  const sourceKey = JSON.stringify([
    'wiki_document',
    organizationId,
    documentId,
  ]);
  const keys = [
    sourceKey,
    JSON.stringify(['wiki_document', otherOrganizationId, documentId]),
  ];
  let writer: LangchainNeo4jGraphAdapter;
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;

  beforeAll(async () => {
    const config = await knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('Neo4j 검증 연결이 없습니다.');
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
      `MATCH (node)
      WHERE node.organizationId IN $organizations OR (node:KGProjectionSource AND node.key IN $keys)
      DETACH DELETE node`,
      { organizations: [organizationId, otherOrganizationId], keys },
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

  function tracking(version: number, deleted = false, org = organizationId) {
    return OutboxAggregateVersionSchema.parse({
      organizationId: org,
      aggregateKind: 'wiki_document',
      aggregateId: documentId,
      desiredSeq: version,
      appliedSeq: 0,
      deleted,
      projectionStatus: 'pending',
      lastAttemptedAt: null,
      appliedAt: null,
      lastError: null,
      updatedAt: new Date('2026-10-09T00:00:00.000Z'),
    });
  }

  function document(
    title = '문서',
    parentDocumentId: string | null = null,
    org = organizationId,
  ) {
    return WikiProjectionSourceSchema.parse({
      id: documentId,
      organizationId: org,
      collectionId,
      parentDocumentId,
      title,
      position: 0,
      updatedAt: new Date('2026-10-09T00:00:00.000Z'),
    });
  }

  function read() {
    return graph.query(
      `MATCH (node:KGWorkOSWikiDocument {key: $sourceKey})
      MATCH (marker:KGProjectionSource {key: $sourceKey})
      OPTIONAL MATCH (node)-[:KG_WIKI_PARENT]->(parent)
      RETURN node.title AS title, node.deleted AS deleted, marker.appliedSeq AS version,
        collect(parent.sourceId) AS parents`,
      { sourceKey },
    );
  }

  it('동일 버전 반복은 node를 복제하거나 마지막 값을 덮지 않는다', async () => {
    await writer.applyWiki(tracking(1), document('첫 원본'));
    await Promise.all(
      Array.from({ length: 10 }, () =>
        writer.applyWiki(tracking(1), document('중복 payload')),
      ),
    );
    expect(await read()).toEqual([
      { title: '첫 원본', deleted: false, version: 1, parents: [] },
    ]);
  });

  it('최신 쓰기 뒤 늦은 이전 버전은 최신 제목과 부모 관계를 되돌리지 않는다', async () => {
    await writer.applyWiki(tracking(10), document('최신 원본', parentB));
    await writer.applyWiki(tracking(9), document('오래된 원본', parentA));
    expect(await read()).toEqual([
      { title: '최신 원본', deleted: false, version: 10, parents: [parentB] },
    ]);
  });

  it('같은 timestamp의 여러 worker가 경합해도 가장 높은 버전으로 수렴한다', async () => {
    await writer.applyWiki(tracking(1), document('초기'));
    await Promise.all(
      [8, 4, 7, 3, 10, 2, 9, 6, 5].map((version) =>
        writer.applyWiki(tracking(version), document(`버전 ${version}`)),
      ),
    );
    expect(await read()).toEqual([
      { title: '버전 10', deleted: false, version: 10, parents: [] },
    ]);
  });

  it('부모 변경과 NULL 전환은 이전 parent edge만 제거한다', async () => {
    await writer.applyWiki(tracking(1), document('원본', parentA));
    await writer.applyWiki(tracking(2), document('원본', parentB));
    expect(await read()).toEqual([
      { title: '원본', deleted: false, version: 2, parents: [parentB] },
    ]);
    await writer.applyWiki(tracking(3), document('원본'));
    expect(await read()).toEqual([
      { title: '원본', deleted: false, version: 3, parents: [] },
    ]);
  });

  it('삭제 tombstone 뒤 오래된 create는 node를 부활시키지 않는다', async () => {
    await writer.applyWiki(tracking(1), document('삭제 전', parentA));
    await writer.applyWiki(tracking(3, true), null);
    await writer.applyWiki(tracking(2), document('늦은 create', parentB));
    expect(await read()).toEqual([
      { title: null, deleted: true, version: 3, parents: [] },
    ]);
  });

  it('최초 전달이 삭제여도 marker를 남겨 stale create를 차단한다', async () => {
    await writer.applyWiki(tracking(5, true), null);
    await writer.applyWiki(tracking(4), document('부활 금지'));
    expect(await read()).toEqual([]);
    expect(
      await graph.query(
        'MATCH (marker:KGProjectionSource {key: $sourceKey}) RETURN marker.appliedSeq AS version, marker.deleted AS deleted',
        { sourceKey },
      ),
    ).toEqual([{ version: 5, deleted: true }]);
  });

  it('삭제와 오래된 쓰기의 병렬 경합에서도 tombstone이 최종 상태다', async () => {
    await writer.applyWiki(tracking(1), document('초기'));
    await Promise.all([
      writer.applyWiki(tracking(10, true), null),
      writer.applyWiki(tracking(9), document('늦은 원본', parentA)),
    ]);
    expect(await read()).toEqual([
      { title: null, deleted: true, version: 10, parents: [] },
    ]);
  });

  it('다른 조직의 동일 source ID와 별도 owner 관계는 재투영·삭제로 훼손되지 않는다', async () => {
    await writer.applyWiki(tracking(1), document('조직 A'));
    await writer.applyWiki(
      tracking(1, false, otherOrganizationId),
      document('조직 B', null, otherOrganizationId),
    );
    await graph.query(
      `MATCH (node:KGWorkOSWikiDocument {key: $sourceKey})
      CREATE (target:KGTestCurated {organizationId: $organizationId})
      CREATE (node)-[:KG_TEST_CURATED]->(target)`,
      { sourceKey, organizationId },
    );
    await writer.applyWiki(tracking(2), document('조직 A 수정'));
    await writer.applyWiki(tracking(3, true), null);
    expect(
      await graph.query(
        `MATCH (node:KGWorkOSWikiDocument {organizationId: $otherOrganizationId}) RETURN node.title AS title, node.deleted AS deleted`,
        { otherOrganizationId },
      ),
    ).toEqual([{ title: '조직 B', deleted: false }]);
    expect(
      await graph.query(
        'MATCH (:KGWorkOSWikiDocument {key: $sourceKey})-[relation:KG_TEST_CURATED]->() RETURN count(relation) AS count',
        { sourceKey },
      ),
    ).toEqual([{ count: '1' }]);
  });

  it('다른 조직이나 식별자의 원본을 현재 tracking으로 투영하지 않는다', async () => {
    await expect(
      writer.applyWiki(
        tracking(1),
        document('다른 조직', null, otherOrganizationId),
      ),
    ).rejects.toThrow('조직 또는 식별자');
    await expect(
      writer.applyWiki(tracking(1), { ...document(), id: randomUUID() }),
    ).rejects.toThrow('조직 또는 식별자');
    expect(await read()).toEqual([]);
  });
});
