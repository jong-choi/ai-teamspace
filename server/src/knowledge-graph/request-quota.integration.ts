import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { KnowledgeGraphRateLimitedError } from '@/knowledge-graph/domain/graph-query.error';
import { RequestQuotaPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/request-quota-persistence.module';
import { requestQuota } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/request-quota.schema';
import { RequestQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/request-quota.repository';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';

import { and, eq } from 'drizzle-orm';

const organizationId = 'kg-p8-quota-organization';
const actorUserId = 'kg-p8-quota-actor';

describeKnowledgeGraph('R8-04 지식 그래프 요청 한도 PostgreSQL 통합', () => {
  let moduleRef: TestingModule;
  let databaseService: DatabaseService;
  let quota: RequestQuotaRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        RequestQuotaPersistenceModule,
      ],
    }).compile();
    await moduleRef.init();
    databaseService = moduleRef.get(DatabaseService);
    quota = moduleRef.get(RequestQuotaRepository);
  });

  beforeEach(async () => {
    await databaseService.db
      .delete(requestQuota)
      .where(eq(requestQuota.organizationId, organizationId));
    await databaseService.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await databaseService.db.delete(user).where(eq(user.id, actorUserId));
    await databaseService.db.insert(user).values({
      id: actorUserId,
      name: 'P8 quota actor',
      email: 'kg-p8-quota@example.com',
    });
    await databaseService.db.insert(organization).values({
      id: organizationId,
      name: 'P8 quota organization',
      slug: organizationId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await databaseService.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await databaseService.db.delete(user).where(eq(user.id, actorUserId));
    await moduleRef.close();
  });

  it('동시 소비가 조직 한도를 넘지 않고 초과 요청에 재시도 시간을 준다', async () => {
    const results = await Promise.allSettled([
      consume({ actorLimit: null, organizationLimit: 1 }),
      consume({ actorLimit: null, organizationLimit: 1 }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejected = results.find(({ status }) => status === 'rejected');
    expect(rejected).toMatchObject({
      reason: expect.objectContaining({
        code: 'KG_RATE_LIMITED',
        retryAfterSeconds: expect.any(Number),
      }),
    });
    expect(
      await databaseService.db
        .select({ count: requestQuota.count })
        .from(requestQuota)
        .where(
          and(
            eq(requestQuota.organizationId, organizationId),
            eq(requestQuota.subjectKind, 'organization'),
          ),
        ),
    ).toEqual([{ count: 1 }]);
  });

  it('actor 한도 실패가 앞선 조직 counter 증가도 rollback한다', async () => {
    await consume({ actorLimit: 1, organizationLimit: 5 });

    await expect(
      consume({ actorLimit: 1, organizationLimit: 5 }),
    ).rejects.toBeInstanceOf(KnowledgeGraphRateLimitedError);

    const rows = await databaseService.db
      .select({
        subjectKind: requestQuota.subjectKind,
        count: requestQuota.count,
      })
      .from(requestQuota)
      .where(eq(requestQuota.organizationId, organizationId));
    expect(rows).toEqual(
      expect.arrayContaining([
        { subjectKind: 'organization', count: 1 },
        { subjectKind: 'actor', count: 1 },
      ]),
    );
  });

  it('2 window보다 오래된 같은 action의 counter만 접수와 함께 정리한다', async () => {
    const hour = 3600 * 1000;
    const now = Date.now();
    await databaseService.db.insert(requestQuota).values([
      {
        organizationId,
        subjectKind: 'organization',
        subjectId: organizationId,
        action: 'wiki_refresh',
        windowStartAt: new Date(now - 5 * hour),
        count: 3,
      },
      {
        organizationId,
        subjectKind: 'organization',
        subjectId: organizationId,
        action: 'wiki_refresh',
        windowStartAt: new Date(now - hour),
        count: 2,
      },
      {
        organizationId,
        subjectKind: 'organization',
        subjectId: organizationId,
        action: 'graph_rebuild',
        windowStartAt: new Date(now - 5 * hour),
        count: 1,
      },
    ]);

    await consume({ actorLimit: null, organizationLimit: 5 });

    const rows = await databaseService.db
      .select({
        action: requestQuota.action,
        count: requestQuota.count,
        windowStartAt: requestQuota.windowStartAt,
      })
      .from(requestQuota)
      .where(eq(requestQuota.organizationId, organizationId));
    expect(
      rows.filter(
        ({ action, windowStartAt }) =>
          action === 'wiki_refresh' && windowStartAt.getTime() < now - 2 * hour,
      ),
    ).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows.map(({ action }) => action).sort()).toEqual([
      'graph_rebuild',
      'wiki_refresh',
      'wiki_refresh',
    ]);
  });

  function consume(policy: {
    actorLimit: number | null;
    organizationLimit: number;
  }) {
    return databaseService.runInTransaction(() =>
      quota.consume({
        action: 'wiki_refresh',
        organizationId,
        actorUserId,
        policy: { windowSeconds: 3600, ...policy },
      }),
    );
  }
});
