import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { graphSourceKey } from '@/knowledge-graph/domain/graph-source-key';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { LangchainNeo4jGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-graph.adapter';
import { GraphRebuildWorkerDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/graph-rebuild-worker.repository';
import { graphRebuildRequest } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.schema';
import type { SemanticRefreshService } from '@/knowledge-graph/semantic-refresh.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';
import { WikiProjectionSourceSchema } from '@/wiki/domain/wiki-projection-source';

import { and, eq } from 'drizzle-orm';

const enabled =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a5' &&
  Boolean(process.env.NEO4J_URI);
const describeIsolated = enabled ? describe : describe.skip;

describeIsolated('F8-05 rebuild 중 live write 최신 CAS', () => {
  const orgA = `kg-p8-a5-f805-a-${randomUUID()}`;
  const orgB = `kg-p8-a5-f805-b-${randomUUID()}`;
  const requesterId = `${orgA}-requester`;
  const aId = randomUUID();
  const bId = randomUUID();
  const collectionId = randomUUID();
  const aKey = graphSourceKey('wiki_document', orgA, aId);
  const bKey = graphSourceKey('wiki_document', orgB, bId);

  let database: DatabaseService;
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let writer: LangchainNeo4jGraphAdapter;
  let publisher: OutboxAggregateChangePublisher;
  let worker: GraphRebuildWorkerDrizzleRepository;

  beforeAll(async () => {
    database = new DatabaseService(
      new ConfigService({ database: { url: process.env.DATABASE_URL } }),
    );
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
    publisher = new OutboxAggregateChangePublisher({
      add: async () => undefined,
    } as never);
    worker = new GraphRebuildWorkerDrizzleRepository(
      database,
      publisher,
      {
        requestManualRefreshInTransaction: async () => ({
          outcome: 'accepted',
          requestId: randomUUID(),
          coalesced: false,
        }),
      } as unknown as SemanticRefreshService,
    );
  });

  beforeEach(async () => {
    await graph.query(
      `MATCH (node)
       WHERE node.organizationId IN [$orgA, $orgB]
          OR (node:KGProjectionSource AND node.key IN [$aKey, $bKey])
       DETACH DELETE node`,
      { orgA, orgB, aKey, bKey },
    );
    await database.db.delete(organization).where(eq(organization.id, orgA));
    await database.db.delete(organization).where(eq(organization.id, orgB));
    await database.db.delete(user).where(eq(user.id, requesterId));
    await database.db.insert(user).values({
      id: requesterId,
      name: requesterId,
      email: `${requesterId}@example.com`,
    });
    await database.db.insert(organization).values([
      { id: orgA, name: orgA, slug: orgA, createdAt: new Date() },
      { id: orgB, name: orgB, slug: orgB, createdAt: new Date() },
    ]);
    await database.db.insert(outboxAggregateVersion).values([
      {
        organizationId: orgA,
        aggregateKind: 'wiki_document',
        aggregateId: aId,
        desiredSeq: 1,
        appliedSeq: 1,
        projectionStatus: 'applied',
      },
      {
        organizationId: orgB,
        aggregateKind: 'wiki_document',
        aggregateId: bId,
        desiredSeq: 1,
        appliedSeq: 1,
        projectionStatus: 'applied',
      },
    ]);
  });

  afterAll(async () => {
    try {
      await graph.query(
        `MATCH (node)
         WHERE node.organizationId IN [$orgA, $orgB]
            OR (node:KGProjectionSource AND node.key IN [$aKey, $bKey])
         DETACH DELETE node`,
        { orgA, orgB, aKey, bKey },
      );
      await database.db.delete(organization).where(eq(organization.id, orgA));
      await database.db.delete(organization).where(eq(organization.id, orgB));
      await database.db.delete(user).where(eq(user.id, requesterId));
    } finally {
      await writer?.onApplicationShutdown();
      await graph?.close();
      await database?.onApplicationShutdown();
    }
  });

  function wiki(organizationId: string, id: string, title: string) {
    return WikiProjectionSourceSchema.parse({
      id,
      organizationId,
      collectionId,
      parentDocumentId: null,
      title,
      position: 0,
      updatedAt: new Date(),
    });
  }

  async function tracking(organizationId: string, id: string) {
    const [row] = await database.db
      .select()
      .from(outboxAggregateVersion)
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, 'wiki_document'),
          eq(outboxAggregateVersion.aggregateId, id),
        ),
      );
    if (!row) throw new Error('tracking missing');
    return OutboxAggregateVersionSchema.parse(row);
  }

  async function liveChange(
    organizationId: string,
    id: string,
    operation: 'changed' | 'removed',
  ) {
    await database.runInTransaction(() =>
      publisher.wikiChanged(
        database.requireTransaction(),
        organizationId,
        id,
        operation,
      ),
    );
  }

  async function graphRows() {
    return graph.query(
      `UNWIND [$aKey, $bKey] AS key
       MATCH (marker:KGProjectionSource {key: key})
       OPTIONAL MATCH (document:KGWorkOSWikiDocument {key: key})
       RETURN key, marker.appliedSeq AS version, marker.deleted AS markerDeleted,
              document.title AS title, document.deleted AS deleted
       ORDER BY key`,
      { aKey, bKey },
    );
  }

  it('A rebuild intent보다 A live 수정·삭제가 우선하고 stale apply/수동 intent가 삭제를 되살리지 않으며 B는 불변이다', async () => {
    await writer.applyWiki(await tracking(orgA, aId), wiki(orgA, aId, 'A v1'));
    await writer.applyWiki(await tracking(orgB, bId), wiki(orgB, bId, 'B v1'));

    const [request] = await database.db
      .insert(graphRebuildRequest)
      .values({
        organizationId: orgA,
        requestedByUserId: requesterId,
        mode: 'full',
        pipelineFingerprint: semanticPipelineFingerprint,
        phase: 'projection',
      })
      .returning();
    const claim = await worker.claim(request!.id);
    if (typeof claim === 'string') throw new Error(claim);
    expect(
      await worker.commitProjectionPage(claim, 'wiki_document', [aId]),
    ).toBe(true);
    const staleRebuild = await tracking(orgA, aId);
    expect(staleRebuild.desiredSeq).toBe(2);

    await liveChange(orgA, aId, 'changed');
    await liveChange(orgB, bId, 'changed');
    const aLive = await tracking(orgA, aId);
    const bLive = await tracking(orgB, bId);
    expect(aLive.desiredSeq).toBe(3);
    expect(bLive.desiredSeq).toBe(2);
    await writer.applyWiki(aLive, wiki(orgA, aId, 'A live v3'));
    await writer.applyWiki(bLive, wiki(orgB, bId, 'B live v2'));

    await liveChange(orgA, aId, 'removed');
    const aDeleted = await tracking(orgA, aId);
    expect(aDeleted).toMatchObject({ desiredSeq: 4, deleted: true });
    await writer.applyWiki(aDeleted, null);

    await writer.applyWiki(staleRebuild, wiki(orgA, aId, 'A stale rebuild v2'));
    await writer.applyWiki(aLive, wiki(orgA, aId, 'A stale live v3'));

    const manualAfterDelete = await database.runInTransaction(() =>
      publisher.recordOperatorIntent(
        database.requireTransaction(),
        orgA,
        'wiki_document',
        aId,
      ),
    );
    expect(manualAfterDelete).toBe(false);
    expect((await tracking(orgA, aId)).desiredSeq).toBe(4);

    const rows = await graphRows();
    const a = rows.find((row) => row.key === aKey);
    const b = rows.find((row) => row.key === bKey);
    expect(a).toMatchObject({
      version: 4,
      markerDeleted: true,
      title: null,
      deleted: true,
    });
    expect(b).toMatchObject({
      version: 2,
      markerDeleted: false,
      title: 'B live v2',
      deleted: false,
    });
  });
});
