import { randomUUID } from 'node:crypto';

import { CalendarSchedulingRepository } from '@/calendar/infrastructure/persistence/calendar-scheduling.repository';
import { KnowledgeGraphMembershipBridge } from '@/jobs/knowledge-graph/knowledge-graph-membership-bridge';
import { CuratedGraphService } from '@/knowledge-graph/curated-graph.service';
import { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';
import { KnowledgeGraphReconciliationService } from '@/knowledge-graph/knowledge-graph-reconciliation.service';
import {
  createReconciliationRecoveryContext,
  describeRecovery,
} from '@/knowledge-graph/testing/reconciliation-recovery.context';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';

import { and, eq } from 'drizzle-orm';

jest.setTimeout(120_000);

describeRecovery('회원 변경·조직 삭제의 실제 그래프 복구', () => {
  const context = createReconciliationRecoveryContext();

  it('F-04 Better Auth role·탈퇴·재가입 의도 유실은 applied membership 관찰로 복구한다', async () => {
    const owner = await context.actor();
    const org = await context.createOrganization(owner);
    const participant = await context.actor();
    const joined = await context.auth().api.addMember({
      body: { organizationId: org, userId: participant.userId, role: 'member' },
    });
    if (!joined) throw new Error('가입 결과가 없습니다.');
    jest
      .spyOn(context.jobs.get(KnowledgeGraphMembershipBridge), 'record')
      .mockResolvedValue(undefined);
    await context.due('organizations');
    await context.jobs
      .get(KnowledgeGraphReconciliationService)
      .discoverOrganizations();
    await context.tick();
    await context.queue.resume();
    await context.converged(org, 2);
    const observe = async () => {
      await context.database
        .update(outboxAggregateVersion)
        .set({ updatedAt: new Date(0) })
        .where(
          and(
            eq(outboxAggregateVersion.organizationId, org),
            eq(outboxAggregateVersion.aggregateKind, 'membership'),
          ),
        );
      await context.due('membership_sources');
      await context.tick();
      await context.converged(org, 2);
    };
    const key = JSON.stringify(['membership', org, participant.userId]);
    await context.auth().api.updateMemberRole({
      headers: owner.headers,
      body: { organizationId: org, memberId: joined.id, role: 'admin' },
    });
    await observe();
    expect(
      await context.graph.query(
        'MATCH (node:KGWorkOSMembership {key:$key}) RETURN node.role AS role, node.deleted AS deleted',
        { key },
      ),
    ).toEqual([{ role: 'admin', deleted: false }]);
    await context.auth().api.removeMember({
      headers: owner.headers,
      body: { organizationId: org, memberIdOrEmail: joined.id },
    });
    await observe();
    expect(
      await context.graph.query(
        'MATCH (node:KGWorkOSMembership {key:$key}) OPTIONAL MATCH (node)-[relation]->() RETURN node.deleted AS deleted, count(relation) AS relations',
        { key },
      ),
    ).toEqual([{ deleted: true, relations: '0' }]);
    await context.auth().api.addMember({
      body: { organizationId: org, userId: participant.userId, role: 'member' },
    });
    await observe();
    expect(
      await context.graph.query(
        'MATCH (node:KGWorkOSMembership {key:$key}) RETURN node.role AS role, node.deleted AS deleted',
        { key },
      ),
    ).toEqual([{ role: 'member', deleted: false }]);
    expect(
      (await context.state().current(org, 'membership', participant.userId))
        ?.desiredSeq,
    ).toBe(4);
  });

  it('F-05 실제 조직 삭제 cascade는 모든 tracked 원본을 tombstone하고 조직 B를 보존한다', async () => {
    const owner = await context.actor();
    const org = await context.createOrganization(owner);
    const other = await context.createOrganization(owner);
    await context.createWiki(other, owner.userId, 'B 보존');
    const wiki = await context.createWiki(org, owner.userId);
    const project = await context.createProject(org, owner.userId);
    const columns = await context.jobs
      .get(ProjectColumnRepository)
      .listColumns(org, project.id);
    if (!columns?.[0]) throw new Error('컬럼이 없습니다.');
    await context.jobs
      .get(TicketRepository)
      .createTicketWithNumber(org, project.id, owner.userId, {
        title: '조직 삭제 티켓',
        columnId: columns[0].id,
      });
    await context.jobs.get(CalendarSchedulingRepository).scheduleMeeting(
      org,
      owner.userId,
      {
        title: '조직 삭제 회의',
        category: 'team',
        startAt: '2030-01-01T00:00:00Z',
        endAt: '2030-01-01T01:00:00Z',
        timeZone: 'UTC',
        locationType: 'online',
        attendeeUserIds: [],
      },
      [],
      [
        {
          startAt: new Date('2030-01-01T00:00:00Z'),
          endAt: new Date('2030-01-01T01:00:00Z'),
          recurrenceOriginalStartAt: null,
        },
      ],
      null,
      randomUUID(),
    );
    const curated = context.jobs.get(CuratedGraphService);
    const node = await curated.createNode(org, owner.userId, {
      kind: 'custom',
      title: '조직 삭제 curated',
    });
    await curated.createEdge(org, owner.userId, {
      sourceNodeId: node.id,
      targetNodeId: wiki.id,
      targetNodeKind: 'wiki_document',
      predicate: 'references',
    });
    await context.due('organizations');
    await context.jobs
      .get(KnowledgeGraphReconciliationService)
      .discoverOrganizations();
    await context.tick();
    await context.queue.resume();
    await context.converged(org, 7);
    await context.converged(other, 2);
    const beforeOther = await context.rows(other);
    const graphBefore = await context.graph.query(
      'MATCH (node) WHERE node.organizationId=$org RETURN node.key AS key, node.deleted AS deleted ORDER BY key',
      { org: other },
    );
    await context.auth().api.deleteOrganization({
      headers: owner.headers,
      body: { organizationId: org },
    });
    await context.due('organization_presence');
    await context.tick();
    await context.converged(org);
    expect((await context.rows(org)).every(({ deleted }) => deleted)).toBe(
      true,
    );
    expect(
      await context.database
        .select()
        .from(reconciliationScope)
        .where(eq(reconciliationScope.organizationId, org)),
    ).toEqual([]);
    expect(
      await context.graph.query(
        'MATCH (node) WHERE node.organizationId=$org AND (node:KGWorkOSWikiDocument OR node:KGWorkOSProject OR node:KGWorkOSTicket OR node:KGWorkOSMeeting OR node:KGCuratedNode OR node:KGWorkOSMembership) AND coalesce(node.deleted,false)=false RETURN count(node) AS active',
        { org },
      ),
    ).toEqual([{ active: '0' }]);
    expect(await context.rows(other)).toEqual(beforeOther);
    expect(
      await context.graph.query(
        'MATCH (node) WHERE node.organizationId=$org RETURN node.key AS key, node.deleted AS deleted ORDER BY key',
        { org: other },
      ),
    ).toEqual(graphBefore);
  });

  it('F-06 실제 registry 10조직의 존재 조회 이상치는 tombstone 0과 고정 오류를 남긴다', async () => {
    const owner = await context.actor();
    for (let i = 0; i < 10; i++) {
      const org = await context.createOrganization(owner);
      await context.createProject(org, owner.userId);
    }
    await context.queue.resume();
    for (const org of context.organizations) await context.converged(org, 1);
    const sources = context.sources();
    jest.spyOn(sources, 'existingOrganizationIds').mockResolvedValue([]);
    await context.due('organization_presence');
    await context.tick();
    const [presence] = await context.database
      .select()
      .from(reconciliationScope)
      .where(eq(reconciliationScope.id, 'organization_presence'));
    expect(presence).toMatchObject({
      lastError: 'KNOWLEDGE_GRAPH_ORGANIZATION_PRESENCE_ANOMALY',
      failureCount: 1,
    });
    for (const org of context.organizations)
      expect((await context.rows(org)).every(({ deleted }) => !deleted)).toBe(
        true,
      );
  });
});
