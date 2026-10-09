import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { GraphRebuildRequestDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/graph-rebuild-request.repository';
import { RequestQuotaDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/request-quota.repository';
import { graphRebuildRequest } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.schema';
import type { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { requestQuota } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/request-quota.schema';

import { jest } from '@jest/globals';
import { eq, inArray } from 'drizzle-orm';

const describeIsolated =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a5'
    ? describe
    : describe.skip;

describeIsolated('R8-08 rebuild 접수 PostgreSQL single-flight', () => {
  const prefix = `kg-p8-a5-request-${randomUUID().slice(0, 8)}`;
  const organizationId = `${prefix}-org`;
  const adminA = `${prefix}-admin-a`;
  const adminB = `${prefix}-admin-b`;
  const memberId = `${prefix}-member`;
  let database: DatabaseService;
  let repository: GraphRebuildRequestDrizzleRepository;
  const outboxAdd = jest.fn(async () => undefined);

  beforeAll(async () => {
    database = new DatabaseService(
      new ConfigService({ database: { url: process.env.DATABASE_URL } }),
    );
    const administrators = new Set([adminA, adminB]);
    const access = {
      assertReadable: async () => undefined,
      isAdministrator: async ({ userId }: { userId: string }) =>
        administrators.has(userId),
      lockWikiWriter: async () => 'not_found' as const,
      lockAdministrator: async (_organizationId: string, actorUserId: string) =>
        administrators.has(actorUserId),
    } as GraphSourceAccessProvider;
    repository = new GraphRebuildRequestDrizzleRepository(
      database,
      access,
      new RequestQuotaDrizzleRepository(database),
      { add: outboxAdd } as never,
      knowledgeGraphConfig(),
    );
  });

  beforeEach(async () => {
    outboxAdd.mockClear();
    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.db
      .delete(user)
      .where(inArray(user.id, [adminA, adminB, memberId]));
    await database.db.insert(user).values(
      [adminA, adminB, memberId].map((id) => ({
        id,
        name: id,
        email: `${id}@example.com`,
      })),
    );
    await database.db.insert(organization).values({
      id: organizationId,
      name: organizationId,
      slug: organizationId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.db
      .delete(user)
      .where(inArray(user.id, [adminA, adminB, memberId]));
    await database.onApplicationShutdown();
  });

  it('R8-08 두 관리자 동시 요청은 활성 1행과 같은 requestId로 coalesce한다', async () => {
    const [left, right] = await Promise.all([
      repository.request(organizationId, adminA, 'full'),
      repository.request(organizationId, adminB, 'full'),
    ]);

    expect(left.outcome).toBe('accepted');
    expect(right.outcome).toBe('accepted');
    if (left.outcome !== 'accepted' || right.outcome !== 'accepted') return;
    expect(left.acceptance.id).toBe(right.acceptance.id);
    expect([left.acceptance.coalesced, right.acceptance.coalesced].sort()).toEqual([
      false,
      true,
    ]);
    expect(
      await database.db
        .select()
        .from(graphRebuildRequest)
        .where(eq(graphRebuildRequest.organizationId, organizationId)),
    ).toHaveLength(1);
    expect(
      await database.db
        .select()
        .from(requestQuota)
        .where(eq(requestQuota.organizationId, organizationId)),
    ).toHaveLength(1);
    expect(outboxAdd).toHaveBeenCalledTimes(1);
  });

  it('R8-08 일반 member는 접수 전에 forbidden이고 행·quota·Outbox를 만들지 않는다', async () => {
    await expect(
      repository.request(organizationId, memberId, 'projection_repair'),
    ).resolves.toEqual({ outcome: 'forbidden' });
    expect(
      await database.db
        .select()
        .from(graphRebuildRequest)
        .where(eq(graphRebuildRequest.organizationId, organizationId)),
    ).toHaveLength(0);
    expect(
      await database.db
        .select()
        .from(requestQuota)
        .where(eq(requestQuota.organizationId, organizationId)),
    ).toHaveLength(0);
    expect(outboxAdd).not.toHaveBeenCalled();
  });
});
