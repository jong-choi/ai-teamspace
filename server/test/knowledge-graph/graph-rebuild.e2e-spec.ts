import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { JobsModule } from '@/jobs/jobs.module';
import { KnowledgeGraphRebuildOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-rebuild-outbox.transport';
import { KnowledgeGraphRebuildProcessor } from '@/jobs/knowledge-graph/knowledge-graph-rebuild.processor';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { KnowledgeGraphReadModule } from '@/knowledge-graph/knowledge-graph-read.module';
import { McpModule } from '@/mcp/mcp.module';
import { graphRebuildRequest } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.schema';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';

import {
  createRunPrefix,
  KnowledgeGraphHttpFixture,
} from '@test/knowledge-graph/support/knowledge-graph-http.fixture';
import { inArray } from 'drizzle-orm';

@Module({})
class DisabledKnowledgeGraphReadModule {}

@Module({})
class DisabledMcpModule {}

const describeGraphRebuildE2e =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a5'
    ? describe
    : describe.skip;

describeGraphRebuildE2e('graph rebuild HTTP/프로세스 E2E', () => {
  const prefix = createRunPrefix('rebuild-http');
  const organizationIds = new Set<string>();
  let fx: KnowledgeGraphHttpFixture;

  beforeAll(async () => {
    fx = await KnowledgeGraphHttpFixture.boot(prefix, (builder) =>
      builder
        .overrideModule(KnowledgeGraphReadModule)
        .useModule(DisabledKnowledgeGraphReadModule)
        .overrideModule(McpModule)
        .useModule(DisabledMcpModule),
    );
  });

  afterAll(async () => {
    if (organizationIds.size > 0) {
      await fx.database
        .delete(outboxAggregateVersion)
        .where(
          inArray(outboxAggregateVersion.organizationId, [...organizationIds]),
        );
    }
    await fx?.close();
  });

  async function setup(key: string) {
    const owner = await fx.createUser(`${key}-owner`);
    const member = await fx.createUser(`${key}-member`);
    const organizationId = await fx.createOrganization(owner, key);
    organizationIds.add(organizationId);
    await fx.addMember(organizationId, member.userId, 'member');
    return { owner, member, organizationId };
  }

  it('H8-18 rebuild 중에도 업무 쓰기와 read가 동작하고 조직별 completeness가 rebuilding/complete로 분리된다', async () => {
    const a = await setup('h818-a');
    const b = await setup('h818-b');

    await fx.database.insert(graphRebuildRequest).values({
      organizationId: a.organizationId,
      requestedByUserId: a.owner.userId,
      mode: 'full',
      status: 'running',
      pipelineFingerprint: semanticPipelineFingerprint,
      phase: 'projection',
      startedAt: new Date(),
    });

    const createdA = await fx.createWikiDocument(a.owner, a.organizationId, {
      title: 'rebuild 중에도 저장되는 A 문서',
      contentMarkdown: '업무 PG 쓰기는 rebuild와 독립적이다.',
    });
    const createdB = await fx.createWikiDocument(b.owner, b.organizationId, {
      title: '영향받지 않는 B 문서',
      contentMarkdown: '다른 조직 쓰기도 불변이다.',
    });
    expect(createdA.id).toBeTruthy();
    expect(createdB.id).toBeTruthy();

    const aStatus = await a.owner.agent.get(
      `/organizations/${a.organizationId}/knowledge-graph/operations/status`,
    );
    expect(aStatus.status).toBe(200);
    expect(aStatus.body.completeness).toBe('rebuilding');
    expect(aStatus.body.activeRebuild).toMatchObject({
      mode: 'full',
      status: 'running',
    });

    const bStatus = await b.owner.agent.get(
      `/organizations/${b.organizationId}/knowledge-graph/operations/status`,
    );
    expect(bStatus.status).toBe(200);
    expect(bStatus.body.completeness).toBe('complete');
    expect(bStatus.body.activeRebuild).toBeNull();
  });

  it('H8-19 API 앱에는 rebuild worker/relay transport가 없고 JobsModule에는 둘 다 등록된다', async () => {
    expect(() =>
      fx.app.get(KnowledgeGraphRebuildProcessor, { strict: false }),
    ).toThrow();
    expect(() =>
      fx.app.get(KnowledgeGraphRebuildOutboxTransport, { strict: false }),
    ).toThrow();

    const jobs = await Test.createTestingModule({
      imports: [JobsModule],
    }).compile();
    try {
      expect(
        jobs.get(KnowledgeGraphRebuildProcessor, { strict: false }),
      ).toBeInstanceOf(KnowledgeGraphRebuildProcessor);
      expect(
        jobs.get(KnowledgeGraphRebuildOutboxTransport, { strict: false }),
      ).toBeInstanceOf(KnowledgeGraphRebuildOutboxTransport);
    } finally {
      await jobs.close();
    }
  });

  it('H8-22 operations/status는 관리자만 접근하고 요청 조직의 진행도만 집계한다', async () => {
    const a = await setup('h822-a');
    const b = await setup('h822-b');

    await fx.database.insert(outboxAggregateVersion).values([
      {
        organizationId: a.organizationId,
        aggregateKind: 'project',
        aggregateId: randomUUID(),
        desiredSeq: 3,
        appliedSeq: 1,
        projectionStatus: 'pending',
      },
      {
        organizationId: a.organizationId,
        aggregateKind: 'ticket',
        aggregateId: randomUUID(),
        desiredSeq: 2,
        appliedSeq: 1,
        projectionStatus: 'failed',
        lastError: 'KNOWLEDGE_GRAPH_PROJECTION_FAILED',
      },
      ...Array.from({ length: 5 }, () => ({
        organizationId: b.organizationId,
        aggregateKind: 'project' as const,
        aggregateId: randomUUID(),
        desiredSeq: 10,
        appliedSeq: 0,
        projectionStatus: 'pending' as const,
      })),
    ]);

    const owner = await a.owner.agent.get(
      `/organizations/${a.organizationId}/knowledge-graph/operations/status`,
    );
    expect(owner.status).toBe(200);
    expect(owner.body.projection).toMatchObject({
      pending: 1,
      failed: 1,
    });
    expect(owner.body.completeness).toBe('complete');
    expect(owner.body.activeRebuild).toBeNull();

    const member = await a.member.agent.get(
      `/organizations/${a.organizationId}/knowledge-graph/operations/status`,
    );
    expect(member.status).toBe(403);

    const other = await b.owner.agent.get(
      `/organizations/${b.organizationId}/knowledge-graph/operations/status`,
    );
    expect(other.status).toBe(200);
    expect(other.body.projection).toMatchObject({
      pending: 5,
      failed: 0,
    });
  });
});
