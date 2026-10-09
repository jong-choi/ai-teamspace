import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import { organization } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { JobsModule } from '@/jobs/jobs.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphWriter } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-writer.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { MembershipProjectionQueryService } from '@/organizations/membership-projection-query.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { McpIntegrationApp } from '@test/support/mcp-integration.fixture';
import { and, eq, inArray } from 'drizzle-orm';

jest.setTimeout(30_000);

describeKnowledgeGraph(
  'Membership의 실제 Better Auth·public event·Jobs·Neo4j 연결',
  () => {
    let target: McpIntegrationApp;
    let jobs: TestingModule;
    let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
    const organizationIds = new Set<string>();

    beforeAll(async () => {
      target = await McpIntegrationApp.start({
        environment: {
          KG_PROJECTION_ENABLED: 'true',
          BULLMQ_PREFIX: `kg-membership-flow-${randomUUID()}`,
        },
      });
      const config = knowledgeGraphConfig();
      if (!config.url || !config.username || !config.password)
        throw new Error('검증 Neo4j 설정이 없습니다.');
      graph = await createNeo4jGraph({
        url: config.url,
        username: config.username,
        password: config.password,
        database: config.database,
      });
      jobs = await Test.createTestingModule({
        imports: [JobsModule],
      }).compile();
      await jobs.init();
    });
    afterAll(async () => {
      try {
        await jobs?.close();
        if (target && organizationIds.size)
          await target.database
            .delete(outboxAggregateVersion)
            .where(
              inArray(outboxAggregateVersion.organizationId, [
                ...organizationIds,
              ]),
            );
        if (graph)
          await graph.query(
            'MATCH (node) WHERE node.organizationId IN $organizations OR (node:KGProjectionSource AND any(prefix IN $prefixes WHERE node.key STARTS WITH prefix)) DETACH DELETE node',
            {
              organizations: [...organizationIds],
              prefixes: [...organizationIds].map(
                (id) => `["membership","${id}",`,
              ),
            },
          );
      } finally {
        await graph?.close();
        await target?.close();
      }
    });
    async function applied(
      organizationId: string,
      userId: string,
      version: number,
    ) {
      await waitForCondition(
        async () => {
          const [state] = await target.database
            .select()
            .from(outboxAggregateVersion)
            .where(
              and(
                eq(outboxAggregateVersion.organizationId, organizationId),
                eq(outboxAggregateVersion.aggregateKind, 'membership'),
                eq(outboxAggregateVersion.aggregateId, userId),
              ),
            );
          return state?.appliedSeq === version;
        },
        `Membership 버전 ${version}의 실제 투영을 확인하지 못했습니다.`,
        { timeoutMs: 15_000 },
      );
    }
    async function read(organizationId: string, userId: string) {
      return graph.query(
        'MATCH (membership:KGWorkOSMembership {key: $key}) OPTIONAL MATCH (membership)-[relation]->() RETURN membership.role AS role, membership.deleted AS deleted, collect(type(relation)) AS relations',
        { key: JSON.stringify(['membership', organizationId, userId]) },
      );
    }

    it('조직 생성·초대 수락·역할 변경·탈퇴·재가입이 현재 PG membership으로 수렴한다', async () => {
      const owner = await target.createActor({ scopes: ['wiki:read'] });
      organizationIds.add(owner.organizationId);
      await applied(owner.organizationId, owner.userId, 1);
      expect(await read(owner.organizationId, owner.userId)).toEqual([
        {
          role: 'owner',
          deleted: false,
          relations: expect.arrayContaining([
            'KG_MEMBERSHIP_USER',
            'KG_MEMBERSHIP_ORGANIZATION',
          ]),
        },
      ]);
      const member = await target.addMember(owner, { scopes: ['wiki:read'] });
      await applied(owner.organizationId, member.userId, 1);
      expect(await read(owner.organizationId, member.userId)).toEqual([
        {
          role: 'member',
          deleted: false,
          relations: expect.arrayContaining([
            'KG_MEMBERSHIP_USER',
            'KG_MEMBERSHIP_ORGANIZATION',
          ]),
        },
      ]);
      await owner.agent
        .patch(
          `/organizations/${owner.organizationId}/members/${member.memberId}/role`,
        )
        .send({ role: 'admin' })
        .expect(200);
      await applied(owner.organizationId, member.userId, 2);
      expect(
        (await read(owner.organizationId, member.userId))[0],
      ).toMatchObject({ role: 'admin', deleted: false });
      const beforeRemoval = await jobs
        .get(MembershipProjectionQueryService)
        .current(owner.organizationId, member.userId);
      await owner.agent
        .delete(
          `/organizations/${owner.organizationId}/members/${member.memberId}`,
        )
        .expect(204);
      await applied(owner.organizationId, member.userId, 3);
      expect(await read(owner.organizationId, member.userId)).toEqual([
        { role: 'admin', deleted: true, relations: [] },
      ]);
      const [removed] = await target.database
        .select()
        .from(outboxAggregateVersion)
        .where(
          and(
            eq(outboxAggregateVersion.organizationId, owner.organizationId),
            eq(outboxAggregateVersion.aggregateKind, 'membership'),
            eq(outboxAggregateVersion.aggregateId, member.userId),
          ),
        );
      await jobs.get(KnowledgeGraphWriter).applyMembership(
        OutboxAggregateVersionSchema.parse({
          ...removed,
          desiredSeq: 2,
          deleted: false,
        }),
        beforeRemoval,
      );
      expect(
        (await read(owner.organizationId, member.userId))[0],
      ).toMatchObject({ deleted: true, relations: [] });
      const rejoined = await target.inviteMember(owner, member);
      expect(rejoined.memberId).not.toBe(member.memberId);
      await applied(owner.organizationId, member.userId, 4);
      expect(
        (await read(owner.organizationId, member.userId))[0],
      ).toMatchObject({ role: 'member', deleted: false });
      const other = await target.createActor({ scopes: ['wiki:read'] });
      organizationIds.add(other.organizationId);
      await applied(other.organizationId, other.userId, 1);
      expect(
        await graph.query(
          'MATCH (membership:KGWorkOSMembership {key: $key})-[:KG_MEMBERSHIP_ORGANIZATION]->(organization) RETURN organization.organizationId AS organizationId',
          {
            key: JSON.stringify([
              'membership',
              owner.organizationId,
              member.userId,
            ]),
          },
        ),
      ).toEqual([{ organizationId: owner.organizationId }]);
      expect(await read(other.organizationId, member.userId)).toEqual([]);

      const events = target.app.get(OutboxAggregateChangePublisher);
      await target.database.transaction((transaction) =>
        events.membershipChanged(
          transaction,
          owner.organizationId,
          member.userId,
          'removed',
        ),
      );
      await applied(owner.organizationId, member.userId, 6);
      expect(
        (await read(owner.organizationId, member.userId))[0],
      ).toMatchObject({ role: 'member', deleted: false });

      await target.database
        .delete(organization)
        .where(eq(organization.id, owner.organizationId));
      await target.database.transaction(async (transaction) => {
        await events.membershipChanged(
          transaction,
          owner.organizationId,
          member.userId,
          'changed',
        );
        await events.membershipChanged(
          transaction,
          owner.organizationId,
          owner.userId,
          'changed',
        );
      });
      await Promise.all([
        applied(owner.organizationId, member.userId, 8),
        applied(owner.organizationId, owner.userId, 3),
      ]);
      expect(
        (await read(owner.organizationId, member.userId))[0],
      ).toMatchObject({ deleted: true, relations: [] });
      expect((await read(owner.organizationId, owner.userId))[0]).toMatchObject(
        { deleted: true, relations: [] },
      );
      expect((await read(other.organizationId, other.userId))[0]).toMatchObject(
        { deleted: false },
      );
    });
  },
);
