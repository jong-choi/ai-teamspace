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

import { eq } from 'drizzle-orm';

const enabled =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a5' &&
  Boolean(process.env.NEO4J_URI);
const describeIsolated = enabled ? describe : describe.skip;

describeIsolated('N8-07 projection_repair stale-delete resurrection', () => {
  const organizationId = `kg-p8-a5-neo4j-${randomUUID()}`;
  const requesterId = `${organizationId}-requester`;
  const documentId = randomUUID();
  const collectionId = randomUUID();
  const sourceKey = graphSourceKey('wiki_document', organizationId, documentId);
  let database: DatabaseService;
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let writer: LangchainNeo4jGraphAdapter;
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
    worker = new GraphRebuildWorkerDrizzleRepository(
      database,
      new OutboxAggregateChangePublisher({
        add: async () => undefined,
      } as never),
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
       WHERE node.organizationId = $organizationId
          OR (node:KGProjectionSource AND node.key = $sourceKey)
       DETACH DELETE node`,
      { organizationId, sourceKey },
    );
    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.db.delete(user).where(eq(user.id, requesterId));
    await database.db.insert(user).values({
      id: requesterId,
      name: requesterId,
      email: `${requesterId}@example.com`,
    });
    await database.db.insert(organization).values({
      id: organizationId,
      name: organizationId,
      slug: organizationId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    try {
      await graph.query(
        `MATCH (node)
         WHERE node.organizationId = $organizationId
            OR (node:KGProjectionSource AND node.key = $sourceKey)
         DETACH DELETE node`,
        { organizationId, sourceKey },
      );
      await database.db
        .delete(organization)
        .where(eq(organization.id, organizationId));
      await database.db.delete(user).where(eq(user.id, requesterId));
    } finally {
      await writer?.onApplicationShutdown();
      await graph?.close();
      await database?.onApplicationShutdown();
    }
  });

  function document(title: string) {
    return WikiProjectionSourceSchema.parse({
      id: documentId,
      organizationId,
      collectionId,
      parentDocumentId: null,
      title,
      position: 0,
      updatedAt: new Date('2026-10-09T00:00:00.000Z'),
    });
  }

  async function currentTracking() {
    const [row] = await database.db
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.aggregateId, documentId));
    if (!row) throw new Error('tracking missing');
    return OutboxAggregateVersionSchema.parse(row);
  }

  async function readGraph() {
    return graph.query(
      `MATCH (marker:KGProjectionSource {key: $sourceKey})
       OPTIONAL MATCH (node:KGWorkOSWikiDocument {key: $sourceKey})
       RETURN marker.appliedSeq AS version,
              marker.deleted AS markerDeleted,
              node.title AS title,
              node.deleted AS deleted`,
      { sourceKey },
    );
  }

  it('구조 node를 지운 뒤 projection_repair operator intent가 현재 원본을 복구하고 늦은 옛 apply는 무시한다', async () => {
    await database.db.insert(outboxAggregateVersion).values({
      organizationId,
      aggregateKind: 'wiki_document',
      aggregateId: documentId,
      desiredSeq: 1,
      appliedSeq: 1,
      projectionStatus: 'applied',
    });

    const initial = OutboxAggregateVersionSchema.parse({
      ...(await currentTracking()),
      desiredSeq: 1,
    });
    await writer.applyWiki(initial, document('초기 원본'));

    await graph.query(
      'MATCH (node:KGWorkOSWikiDocument {key: $sourceKey}) DETACH DELETE node',
      { sourceKey },
    );
    expect(await readGraph()).toEqual([
      {
        version: 1,
        markerDeleted: false,
        title: null,
        deleted: null,
      },
    ]);

    const [request] = await database.db
      .insert(graphRebuildRequest)
      .values({
        organizationId,
        requestedByUserId: requesterId,
        mode: 'projection_repair',
        pipelineFingerprint: semanticPipelineFingerprint,
        phase: 'projection',
      })
      .returning();
    const claim = await worker.claim(request!.id);
    if (typeof claim === 'string') throw new Error(claim);
    expect(
      await worker.commitProjectionPage(claim, 'wiki_document', [documentId]),
    ).toBe(true);

    const repairedTracking = await currentTracking();
    expect(repairedTracking.desiredSeq).toBe(2);
    await writer.applyWiki(repairedTracking, document('현재 원본'));
    expect(await readGraph()).toEqual([
      {
        version: 2,
        markerDeleted: false,
        title: '현재 원본',
        deleted: false,
      },
    ]);

    const staleTracking = OutboxAggregateVersionSchema.parse({
      ...repairedTracking,
      desiredSeq: 1,
    });
    await writer.applyWiki(staleTracking, document('뒤늦은 옛 원본'));
    expect(await readGraph()).toEqual([
      {
        version: 2,
        markerDeleted: false,
        title: '현재 원본',
        deleted: false,
      },
    ]);
  });
});
