import { randomUUID } from 'node:crypto';

import {
  member,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';
import {
  createReconciliationRecoveryContext,
  describeRecovery,
} from '@/knowledge-graph/testing/reconciliation-recovery.context';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';

import { eq } from 'drizzle-orm';

jest.setTimeout(120_000);

describeRecovery('실제 membership 관찰·조직 삭제의 1K 처리량', () => {
  const context = createReconciliationRecoveryContext();

  it('membership 1K의 실제 Better Auth 관찰은 의도가 없으면 seq를 유지하고 순환한다', async () => {
    const owner = await context.actor();
    const org = await context.createOrganization(owner);
    const runId = randomUUID();
    const createdAt = new Date('2026-10-01T00:00:00Z');
    const users = Array.from(
      { length: 1000 },
      (_, index): typeof user.$inferInsert => ({
        id: `kg-p6-observe-${runId}-${index}`,
        name: '관찰 처리량 사용자',
        email: `kg-p6-observe-${runId}-${index}@example.test`,
      }),
    );
    for (const row of users) context.actors.add(row.id);
    await context.database.insert(user).values(users);
    const memberships = users.map((row, index): typeof member.$inferInsert => ({
      id: `kg-p6-member-${runId}-${index}`,
      userId: row.id,
      organizationId: org,
      role: 'member',
      createdAt,
    }));
    await context.database.insert(member).values(memberships);
    await context.database.insert(outboxAggregateVersion).values(
      memberships.map((row): typeof outboxAggregateVersion.$inferInsert => ({
        organizationId: org,
        aggregateKind: 'membership',
        aggregateId: row.userId,
        desiredSeq: 1,
        appliedSeq: 1,
        projectionStatus: 'applied',
        updatedAt: new Date(0),
        appliedSnapshotDigest: digestGraphJson({
          id: row.id,
          organizationId: org,
          userId: row.userId,
          role: 'member',
          createdAt: createdAt.toISOString(),
        }),
      })),
    );
    const observed = jest.spyOn(context.sources(), 'observeMembershipSnapshot');
    await context.due('membership_sources');
    const startedAt = Date.now();
    await context.tick();
    expect(observed).toHaveBeenCalledTimes(1000);
    expect(
      (await context.rows(org)).every(
        ({ desiredSeq, appliedSeq }) => desiredSeq === 1 && appliedSeq === 1,
      ),
    ).toBe(true);
    const [scope] = await context.database
      .select()
      .from(reconciliationScope)
      .where(eq(reconciliationScope.id, 'membership_sources'));
    expect(scope).toMatchObject({
      afterOrganizationId: null,
      afterAggregateId: null,
      leaseToken: null,
    });
    console.info(
      JSON.stringify({
        scenario: 'membership-1K',
        sources: 1000,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  });

  it('조직 삭제 1K 원본의 tombstone 의도와 실제 Neo4j 적용 처리량을 측정한다', async () => {
    const owner = await context.actor();
    const org = await context.createOrganization(owner);
    await context.historical(org, owner.userId, 1000);
    await context.tick();
    await context.queue.resume();
    await context.converged(org, 1001);
    await context.auth().api.deleteOrganization({
      headers: owner.headers,
      body: { organizationId: org },
    });
    await context.due('organization_presence');
    const startedAt = Date.now();
    await context.tick();
    await context.converged(org, 1001);
    expect((await context.rows(org)).every(({ deleted }) => deleted)).toBe(
      true,
    );
    expect(
      await context.graph.query(
        'MATCH (node:KGWorkOSProject) WHERE node.organizationId=$org AND node.deleted=false RETURN count(node) AS active',
        { org },
      ),
    ).toEqual([{ active: '0' }]);
    console.info(
      JSON.stringify({
        scenario: 'organization-delete-1K',
        sources: 1001,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  });
});
