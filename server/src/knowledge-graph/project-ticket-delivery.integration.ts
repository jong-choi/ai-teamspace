import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import { JobsModule } from '@/jobs/jobs.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { ProjectDrizzlePersistenceModule } from '@/projects/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';
import { TicketChecklistRepository } from '@/projects/infrastructure/persistence/ticket-checklist.repository';
import { TicketLabelRepository } from '@/projects/infrastructure/persistence/ticket-label.repository';
import { TicketOrderingRepository } from '@/projects/infrastructure/persistence/ticket-ordering.repository';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { and, eq } from 'drizzle-orm';

jest.setTimeout(30_000);

const describeWritable =
  process.env.KG_TEST_ALLOW_WRITE === '1' && process.env.NEO4J_URI
    ? describe
    : describe.skip;

describeWritable('Project·Ticket의 실제 PG·Jobs·Neo4j 연결', () => {
  const organizationId = `kg-project-flow-${randomUUID()}`;
  const actorId = `kg-project-actor-${randomUUID()}`;
  const leadId = `kg-project-lead-${randomUUID()}`;
  const original = new Map<string, string | undefined>();
  let app: TestingModule;
  let database: DatabaseService['db'];
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let projects: ProjectRepository;
  let columns: ProjectColumnRepository;

  beforeAll(async () => {
    for (const [key, value] of Object.entries({
      KG_PROJECTION_ENABLED: 'true',
      BULLMQ_PREFIX: `kg-project-flow-${randomUUID()}`,
    })) {
      original.set(key, process.env[key]);
      process.env[key] = value;
    }
    const config = knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('검증 Neo4j 설정이 없습니다.');
    graph = await createNeo4jGraph({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database,
    });
    app = await Test.createTestingModule({
      imports: [JobsModule, ProjectDrizzlePersistenceModule],
    }).compile();
    await app.init();
    database = app.get(DatabaseService).db;
    projects = app.get(ProjectRepository);
    columns = app.get(ProjectColumnRepository);
    await database.insert(user).values(
      [actorId, leadId].map((id) => ({
        id,
        name: 'Project 흐름 검증',
        email: `${id}@example.com`,
        username: id,
      })),
    );
    await database.insert(organization).values({
      id: organizationId,
      name: 'Project 흐름 조직',
      slug: organizationId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    try {
      if (database) {
        await database
          .delete(outboxAggregateVersion)
          .where(eq(outboxAggregateVersion.organizationId, organizationId));
        await database
          .delete(organization)
          .where(eq(organization.id, organizationId));
        await database.delete(user).where(eq(user.id, actorId));
        await database.delete(user).where(eq(user.id, leadId));
      }
      if (graph)
        await graph.query(
          `MATCH (node)
          WHERE node.organizationId = $organizationId OR
            (node:KGProjectionSource AND any(prefix IN $prefixes WHERE node.key STARTS WITH prefix))
          DETACH DELETE node`,
          {
            organizationId,
            prefixes: ['project', 'ticket', 'ticket_label'].map(
              (kind) => `["${kind}","${organizationId}",`,
            ),
          },
        );
    } finally {
      try {
        await app?.close();
        await graph?.close();
      } finally {
        for (const [key, value] of original) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

  async function state(
    projectId: string,
    kind: typeof outboxAggregateVersion.$inferSelect.aggregateKind = 'project',
  ) {
    const [current] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, kind),
          eq(outboxAggregateVersion.aggregateId, projectId),
        ),
      );
    return current;
  }
  async function applied(
    projectId: string,
    version: number,
    kind: typeof outboxAggregateVersion.$inferSelect.aggregateKind = 'project',
  ) {
    await waitForCondition(
      async () => (await state(projectId, kind))?.appliedSeq === version,
      `Project 버전 ${version}의 실제 투영을 확인하지 못했습니다.`,
      { timeoutMs: 15_000 },
    );
  }
  async function read(projectId: string) {
    return graph.query(
      `MATCH (project:KGWorkOSProject {key: $key})
      OPTIONAL MATCH (project)-[:KG_PROJECT_LEAD]->(lead)
      RETURN project.name AS name, project.archivedAt IS NOT NULL AS archived,
        lead.sourceId AS leadId, project.placeholder AS placeholder`,
      { key: JSON.stringify(['project', organizationId, projectId]) },
    );
  }

  it('생성·담당자 변경과 해제·보관·복구가 실제 worker에서 수렴한다', async () => {
    const source = await projects.createProjectWithDefaultColumns(
      organizationId,
      actorId,
      { key: 'FLOW', name: '프로젝트', leadUserId: leadId },
    );
    await applied(source.id, 1);
    expect(await read(source.id)).toEqual([
      { name: '프로젝트', archived: false, leadId, placeholder: false },
    ]);
    const same = await projects.updateProject(organizationId, source.id, {
      name: source.name,
      leadUserId: leadId,
      archived: false,
    });
    expect(same?.updatedAt).toEqual(source.updatedAt);
    expect((await state(source.id))?.desiredSeq).toBe(1);
    await projects.updateProject(organizationId, source.id, {
      name: '변경',
      leadUserId: actorId,
    });
    await applied(source.id, 2);
    expect(await read(source.id)).toEqual([
      { name: '변경', archived: false, leadId: actorId, placeholder: false },
    ]);
    await projects.updateProject(organizationId, source.id, {
      leadUserId: null,
      archived: true,
    });
    await applied(source.id, 3);
    expect(await read(source.id)).toEqual([
      { name: '변경', archived: true, leadId: null, placeholder: false },
    ]);
    await projects.updateProject(organizationId, source.id, {
      archived: false,
    });
    await applied(source.id, 4);
    expect(await read(source.id)).toEqual([
      { name: '변경', archived: false, leadId: null, placeholder: false },
    ]);
  });

  it('column 생성과 이름 변경은 Project 버전을 발행하고 같은 이름은 발행하지 않는다', async () => {
    const source = await projects.createProjectWithDefaultColumns(
      organizationId,
      actorId,
      { key: 'COL', name: '컬럼 검증' },
    );
    await applied(source.id, 1);
    const column = await columns.createColumn(
      organizationId,
      source.id,
      '추가',
    );
    if (!column) throw new Error('컬럼 생성 결과가 없습니다.');
    await applied(source.id, 2);
    const same = await columns.renameColumn(
      organizationId,
      source.id,
      column.id,
      column.name,
    );
    expect(same?.updatedAt).toEqual(column.updatedAt);
    expect((await state(source.id))?.desiredSeq).toBe(2);
    await columns.renameColumn(organizationId, source.id, column.id, '수정');
    await applied(source.id, 3);
    expect(
      await graph.query(
        `MATCH (:KGWorkOSProject {key: $key})-[:KG_PROJECT_COLUMN]->(column)
        RETURN column.name AS name, column.placeholder AS placeholder ORDER BY column.position`,
        { key: JSON.stringify(['project', organizationId, source.id]) },
      ),
    ).toEqual(
      (await columns.listColumns(organizationId, source.id)).map(
        ({ name }) => ({
          name,
          placeholder: false,
        }),
      ),
    );
  });

  it('이동·보관으로 순서가 바뀐 모든 Ticket의 이벤트와 column 관계가 수렴한다', async () => {
    const project = await projects.createProjectWithDefaultColumns(
      organizationId,
      actorId,
      { key: 'ORDER', name: '티켓 순서 검증' },
    );
    const projectColumns = await columns.listColumns(
      organizationId,
      project.id,
    );
    const tickets = app.get(TicketRepository);
    const ordering = app.get(TicketOrderingRepository);
    const created = [];
    for (const title of ['첫째', '둘째', '셋째']) {
      const result = await tickets.createTicketWithNumber(
        organizationId,
        project.id,
        actorId,
        { title, columnId: projectColumns[0].id },
      );
      if (result.kind !== 'created')
        throw new Error('티켓 생성 결과가 없습니다.');
      created.push(result.ticket);
      await applied(result.ticket.id, 1, 'ticket');
    }
    const same = await tickets.updateTicket(
      organizationId,
      project.id,
      created[0].id,
      {
        title: created[0].title,
        assigneeUserId: null,
        dueAt: null,
        archived: false,
      },
    );
    expect(same?.updatedAt).toEqual(created[0].updatedAt);
    expect((await state(created[0].id, 'ticket'))?.desiredSeq).toBe(1);
    const moved = await ordering.moveTicket(
      organizationId,
      project.id,
      created[2].id,
      { targetColumnId: projectColumns[0].id, beforeTicketId: created[0].id },
    );
    expect(moved.kind).toBe('moved');
    for (const ticket of created) await applied(ticket.id, 2, 'ticket');
    await tickets.updateTicket(organizationId, project.id, created[2].id, {
      archived: true,
    });
    for (const ticket of created) await applied(ticket.id, 3, 'ticket');
    await tickets.updateTicket(organizationId, project.id, created[2].id, {
      archived: false,
    });
    await applied(created[2].id, 4, 'ticket');
    await ordering.moveTicket(organizationId, project.id, created[0].id, {
      targetColumnId: projectColumns[1].id,
    });
    await applied(created[0].id, 4, 'ticket');
    await applied(created[1].id, 4, 'ticket');
    await applied(created[2].id, 5, 'ticket');
    for (const ticket of created) {
      const owner = await tickets.findTicketById(
        organizationId,
        project.id,
        ticket.id,
      );
      expect(
        await graph.query(
          `MATCH (ticket:KGWorkOSTicket {key: $key})-[:KG_TICKET_COLUMN]->(column)
          RETURN ticket.position AS position, column.sourceId AS columnId,
            ticket.archivedAt AS archivedAt`,
          { key: JSON.stringify(['ticket', organizationId, ticket.id]) },
        ),
      ).toEqual([
        {
          position: owner?.position,
          columnId: owner?.columnId,
          archivedAt: null,
        },
      ]);
    }
  });

  it('Label과 Checklist 항목의 수정·분리·삭제가 실제 owner 이벤트로 반영된다', async () => {
    const project = await projects.createProjectWithDefaultColumns(
      organizationId,
      actorId,
      { key: 'DETAIL', name: '티켓 상세 검증' },
    );
    const [column] = await columns.listColumns(organizationId, project.id);
    const tickets = app.get(TicketRepository);
    const labels = app.get(TicketLabelRepository);
    const checklists = app.get(TicketChecklistRepository);
    const result = await tickets.createTicketWithNumber(
      organizationId,
      project.id,
      actorId,
      {
        title: '상세',
        columnId: column.id,
        assigneeUserId: leadId,
      },
    );
    if (result.kind !== 'created')
      throw new Error('티켓 생성 결과가 없습니다.');
    const ticketId = result.ticket.id;
    await applied(ticketId, 1, 'ticket');
    const label = await labels.createLabel(organizationId, project.id, {
      name: '라벨',
      color: 'blue',
    });
    if (!label) throw new Error('라벨 생성 결과가 없습니다.');
    await applied(label.id, 1, 'ticket_label');
    await labels.attachLabel(organizationId, project.id, ticketId, label.id);
    await applied(ticketId, 2, 'ticket');
    await labels.updateLabel(organizationId, project.id, label.id, {
      name: '수정 라벨',
      color: 'red',
    });
    await applied(label.id, 2, 'ticket_label');
    expect(
      await graph.query(
        `MATCH (:KGWorkOSTicket {key: $key})-[:KG_TICKET_LABEL]->(label)
      RETURN label.name AS name, label.color AS color, label.placeholder AS placeholder`,
        { key: JSON.stringify(['ticket', organizationId, ticketId]) },
      ),
    ).toEqual([{ name: '수정 라벨', color: 'red', placeholder: false }]);
    const checklist = await checklists.createChecklist(
      organizationId,
      project.id,
      ticketId,
      { title: '할 일' },
    );
    if (!checklist) throw new Error('체크리스트 생성 결과가 없습니다.');
    await applied(ticketId, 3, 'ticket');
    const item = await checklists.addChecklistItem(
      organizationId,
      project.id,
      ticketId,
      checklist.checklist.id,
      { title: '항목' },
    );
    if (!item) throw new Error('항목 생성 결과가 없습니다.');
    await applied(ticketId, 4, 'ticket');
    await checklists.updateChecklistItem(
      organizationId,
      project.id,
      ticketId,
      checklist.checklist.id,
      item.id,
      { completed: true },
    );
    await applied(ticketId, 5, 'ticket');
    expect(
      await graph.query(
        `MATCH (:KGWorkOSTicket {key: $key})-[:KG_TICKET_CHECKLIST]->(:KGWorkOSTicketChecklist)-[:KG_CHECKLIST_ITEM]->(item)
      RETURN item.title AS title, item.completed AS completed`,
        { key: JSON.stringify(['ticket', organizationId, ticketId]) },
      ),
    ).toEqual([{ title: '항목', completed: true }]);
    await checklists.removeChecklistItem(
      organizationId,
      project.id,
      ticketId,
      checklist.checklist.id,
      item.id,
    );
    await applied(ticketId, 6, 'ticket');
    await checklists.removeChecklist(
      organizationId,
      project.id,
      ticketId,
      checklist.checklist.id,
    );
    await applied(ticketId, 7, 'ticket');
    await labels.detachLabel(organizationId, project.id, ticketId, label.id);
    await applied(ticketId, 8, 'ticket');
    await tickets.updateTicket(organizationId, project.id, ticketId, {
      assigneeUserId: null,
    });
    await applied(ticketId, 9, 'ticket');
    expect(
      await graph.query(
        `MATCH (ticket:KGWorkOSTicket {key: $key})
      OPTIONAL MATCH (ticket)-[relation]->()
      WHERE type(relation) IN ['KG_TICKET_LABEL', 'KG_TICKET_CHECKLIST', 'KG_TICKET_ASSIGNEE']
      RETURN count(relation) AS count`,
        { key: JSON.stringify(['ticket', organizationId, ticketId]) },
      ),
    ).toEqual([{ count: '0' }]);
    expect(
      await graph.query(
        'MATCH (:KGWorkOSTicketChecklist {organizationId: $organizationId, ticketId: $ticketId})-[relation:KG_CHECKLIST_ITEM]->() RETURN count(relation) AS count',
        { organizationId, ticketId },
      ),
    ).toEqual([{ count: '0' }]);
  });
});
