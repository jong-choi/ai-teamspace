import { randomUUID } from 'node:crypto';

import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { DatabaseService } from '@/database/database.service';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { OrganizationNotFoundError } from '@/organizations/domain/organization.error';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';

import {
  createRunPrefix,
  KnowledgeGraphHttpFixture,
} from '@test/knowledge-graph/support/knowledge-graph-http.fixture';

describeKnowledgeGraph('A1 owner graph source PostgreSQL 통합', () => {
  const prefix = createRunPrefix('owner-source');
  let fx: KnowledgeGraphHttpFixture;
  let database: DatabaseService;
  let snapshots: GraphSourceSnapshotProvider;
  let access: GraphSourceAccessProvider;

  beforeAll(async () => {
    fx = await KnowledgeGraphHttpFixture.boot(prefix);
    database = fx.app.get(DatabaseService);
    snapshots = fx.app.get(GraphSourceSnapshotProvider, { strict: false });
    access = fx.app.get(GraphSourceAccessProvider, { strict: false });
  });

  afterAll(async () => {
    await fx?.close();
  });

  async function setup() {
    const run = randomUUID().slice(0, 8);
    const ownerA = await fx.createUser(`${run}-owner-a`);
    const memberA = await fx.createUser(`${run}-member-a`);
    const ownerB = await fx.createUser(`${run}-owner-b`);
    const organizationAId = await fx.createOrganization(ownerA, `${run}-org-a`);
    const organizationBId = await fx.createOrganization(ownerB, `${run}-org-b`);
    await fx.addMember(organizationAId, memberA.userId, 'member');

    const wikiA = await fx.createWikiDocument(ownerA, organizationAId, {
      title: 'A 100% 위키',
      contentMarkdown: 'literal % 본문',
    });
    const wikiA2 = await fx.createWikiDocument(ownerA, organizationAId, {
      title: 'B 위키',
      contentMarkdown: '일반 본문',
    });
    const wikiB = await fx.createWikiDocument(ownerB, organizationBId, {
      title: 'A 100% 위키',
      contentMarkdown: 'literal % 다른 조직',
    });

    const projectA = await insertProject(
      organizationAId,
      ownerA.userId,
      'A 프로젝트',
      'A1A',
    );
    const projectA2 = await insertProject(
      organizationAId,
      ownerA.userId,
      'B 프로젝트',
      'A1B',
    );
    const projectB = await insertProject(
      organizationBId,
      ownerB.userId,
      'A 프로젝트',
      'B1A',
    );

    const ticketA = await insertTicket(
      organizationAId,
      ownerA.userId,
      projectA.id,
      'A 티켓',
      1,
    );
    const ticketA2 = await insertTicket(
      organizationAId,
      ownerA.userId,
      projectA.id,
      'B 티켓',
      2,
    );
    const ticketB = await insertTicket(
      organizationBId,
      ownerB.userId,
      projectB.id,
      'A 티켓',
      1,
    );

    const meetingA = await insertMeeting(
      organizationAId,
      ownerA.userId,
      'A 회의',
      1,
    );
    const meetingA2 = await insertMeeting(
      organizationAId,
      ownerA.userId,
      'B 회의',
      2,
    );
    const meetingB = await insertMeeting(
      organizationBId,
      ownerB.userId,
      'A 회의',
      1,
    );

    return {
      ownerA,
      memberA,
      ownerB,
      organizationAId,
      organizationBId,
      wikiA,
      wikiA2,
      wikiB,
      projectA,
      projectA2,
      projectB,
      ticketA,
      ticketA2,
      ticketB,
      meetingA,
      meetingA2,
      meetingB,
    };
  }

  async function insertProject(
    organizationId: string,
    userId: string,
    name: string,
    key: string,
  ) {
    const [row] = await fx.database
      .insert(project)
      .values({
        organizationId,
        key: `${key}-${randomUUID().slice(0, 6)}`,
        name,
        createdByUserId: userId,
      })
      .returning();
    if (!row) throw new Error('Project fixture가 없습니다.');
    return row;
  }

  async function insertTicket(
    organizationId: string,
    userId: string,
    projectId: string,
    title: string,
    number: number,
  ) {
    const [column] = await fx.database
      .insert(projectColumn)
      .values({
        projectId,
        name: `열-${number}-${randomUUID().slice(0, 6)}`,
        position: number,
      })
      .returning();
    if (!column) throw new Error('Project column fixture가 없습니다.');
    const [row] = await fx.database
      .insert(ticket)
      .values({
        organizationId,
        projectId,
        columnId: column.id,
        number,
        title,
        reporterUserId: userId,
        position: number,
      })
      .returning();
    if (!row) throw new Error('Ticket fixture가 없습니다.');
    return row;
  }

  async function insertMeeting(
    organizationId: string,
    userId: string,
    title: string,
    order: number,
  ) {
    const [row] = await fx.database
      .insert(meeting)
      .values({
        organizationId,
        organizerUserId: userId,
        title,
        category: 'team',
        startAt: new Date(`2026-10-09T0${order}:00:00Z`),
        endAt: new Date(`2026-10-09T0${order + 1}:00:00Z`),
        timeZone: 'Asia/Seoul',
        locationType: 'online',
      })
      .returning();
    if (!row) throw new Error('Meeting fixture가 없습니다.');
    return row;
  }

  it('Wiki current·semantic은 organization scope를 강제하고 keyword는 LIKE wildcard를 literal로 처리한다', async () => {
    const data = await setup();

    const current = await snapshots.wikiForGraph(data.organizationAId, [
      data.wikiA.id,
      data.wikiB.id,
    ]);
    const semantic = await snapshots.wikiSemantic(data.organizationAId, [
      data.wikiA.id,
      data.wikiB.id,
    ]);
    const keyword = await snapshots.wikiKeyword(data.organizationAId, '%', 50);

    expect(current.map(({ id }) => id)).toEqual([data.wikiA.id]);
    expect(semantic.map(({ id }) => id)).toEqual([data.wikiA.id]);
    expect(keyword.map(({ id }) => id)).toEqual([data.wikiA.id]);
    expect(keyword[0]?.matchedIn).toEqual(
      expect.arrayContaining(['title', 'content']),
    );
  });

  it('Wiki·Project·Ticket·Meeting 목록은 (title,id) keyset 이후 같은 조직 행만 반환한다', async () => {
    const data = await setup();

    const wiki = await snapshots.listWiki(data.organizationAId, {
      limit: 10,
      q: null,
      after: { title: 'A 100% 위키', id: data.wikiA.id },
    });
    const projects = await snapshots.listProjects(data.organizationAId, {
      limit: 10,
      q: null,
      after: { title: 'A 프로젝트', id: data.projectA.id },
    });
    const tickets = await snapshots.listTickets(data.organizationAId, {
      limit: 10,
      q: null,
      after: { title: 'A 티켓', id: data.ticketA.id },
    });
    const meetings = await snapshots.listMeetings(data.organizationAId, {
      limit: 10,
      q: null,
      after: { title: 'A 회의', id: data.meetingA.id },
    });

    expect(wiki.map(({ id }) => id)).toContain(data.wikiA2.id);
    expect(wiki.map(({ id }) => id)).not.toContain(data.wikiB.id);
    expect(projects.map(({ id }) => id)).toContain(data.projectA2.id);
    expect(projects.map(({ id }) => id)).not.toContain(data.projectB.id);
    expect(tickets.map(({ id }) => id)).toContain(data.ticketA2.id);
    expect(tickets.map(({ id }) => id)).not.toContain(data.ticketB.id);
    expect(meetings.map(({ id }) => id)).toContain(data.meetingA2.id);
    expect(meetings.map(({ id }) => id)).not.toContain(data.meetingB.id);
  });

  it('Project·Ticket·Meeting currentMany는 다른 조직 ID를 섞어도 현재 조직 원본만 반환한다', async () => {
    const data = await setup();

    await expect(
      snapshots.projectsForGraph(data.organizationAId, [
        data.projectA.id,
        data.projectB.id,
      ]),
    ).resolves.toEqual([expect.objectContaining({ id: data.projectA.id })]);
    await expect(
      snapshots.ticketsForGraph(data.organizationAId, [
        data.ticketA.id,
        data.ticketB.id,
      ]),
    ).resolves.toEqual([expect.objectContaining({ id: data.ticketA.id })]);
    await expect(
      snapshots.meetingsForGraph(data.organizationAId, [
        data.meetingA.id,
        data.meetingB.id,
      ]),
    ).resolves.toEqual([expect.objectContaining({ id: data.meetingA.id })]);
  });

  it('member snapshot은 actor의 현재 조직 접근을 확인하고 다른 조직 사용자를 반환하지 않는다', async () => {
    const data = await setup();

    const members = await snapshots.membersForGraph(
      { userId: data.ownerA.userId },
      data.organizationAId,
      [data.memberA.userId, data.ownerB.userId],
    );

    expect(members.map(({ userId }) => userId)).toEqual([data.memberA.userId]);
    await expect(
      snapshots.membersForGraph(
        { userId: data.ownerB.userId },
        data.organizationAId,
        [data.memberA.userId],
      ),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  it('access provider는 현재 membership/admin을 보고 lock capability는 같은 transaction에서 재검증한다', async () => {
    const data = await setup();
    const ownerActor = { userId: data.ownerA.userId };
    const memberActor = { userId: data.memberA.userId };
    const outsiderActor = { userId: data.ownerB.userId };

    await expect(
      access.assertReadable(ownerActor, data.organizationAId),
    ).resolves.toBeUndefined();
    await expect(
      access.assertReadable(outsiderActor, data.organizationAId),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
    await expect(
      access.isAdministrator(ownerActor, data.organizationAId),
    ).resolves.toBe(true);
    await expect(
      access.isAdministrator(memberActor, data.organizationAId),
    ).resolves.toBe(false);

    await expect(
      database.runInTransaction(() =>
        access.lockWikiWriter(
          data.organizationAId,
          data.memberA.userId,
          data.wikiA.id,
        ),
      ),
    ).resolves.toEqual({ updatedAt: expect.any(Date) });
    await expect(
      database.runInTransaction(() =>
        access.lockWikiWriter(
          data.organizationAId,
          data.ownerB.userId,
          data.wikiA.id,
        ),
      ),
    ).resolves.toBe('not_member');
    await expect(
      database.runInTransaction(() =>
        access.lockWikiWriter(
          data.organizationAId,
          data.ownerA.userId,
          data.wikiB.id,
        ),
      ),
    ).resolves.toBe('not_found');
    await expect(
      database.runInTransaction(() =>
        access.lockAdministrator(data.organizationAId, data.ownerA.userId),
      ),
    ).resolves.toBe(true);
    await expect(
      database.runInTransaction(() =>
        access.lockAdministrator(data.organizationAId, data.memberA.userId),
      ),
    ).resolves.toBe(false);
  });
});
