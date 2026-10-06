import { Test, type TestingModule } from '@nestjs/testing';

import { user } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import { ProjectDrizzlePersistenceModule } from '@/projects/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import {
  type CreateProjectPersistenceInput,
  ProjectRepository,
} from '@/projects/infrastructure/persistence/project.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';
import { TicketWorkflowRepository } from '@/projects/infrastructure/persistence/ticket-workflow.repository';

import { inArray } from 'drizzle-orm';

const organizationId = 'ticket-workflow-organization';
const otherOrganizationId = 'ticket-workflow-other-organization';
const actorUserId = 'ticket-workflow-actor';
const otherUserId = 'ticket-workflow-other-user';
const userIds = [actorUserId, otherUserId] as const;

const baseProjectInput: CreateProjectPersistenceInput = {
  organizationId,
  key: 'WF',
  name: '워크플로 프로젝트',
  description: '',
  leadUserId: null,
  createdByUserId: actorUserId,
};

describe('티켓 워크플로 Drizzle 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let projects: ProjectRepository;
  let projectColumns: ProjectColumnRepository;
  let ticketRepository: TicketRepository;
  let workflow: TicketWorkflowRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, ProjectDrizzlePersistenceModule],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    projects = moduleRef.get(ProjectRepository);
    projectColumns = moduleRef.get(ProjectColumnRepository);
    ticketRepository = moduleRef.get(TicketRepository);
    workflow = moduleRef.get(TicketWorkflowRepository);
  });

  beforeEach(async () => {
    await cleanFixtures();
    await database.insert(user).values([
      {
        id: actorUserId,
        name: '워크플로 사용자',
        email: 'ticket-workflow-actor@example.com',
        username: 'ticketworkflowactor',
      },
      {
        id: otherUserId,
        name: '다른 사용자',
        email: 'ticket-workflow-other@example.com',
        username: 'ticketworkflowother',
      },
    ]);
  });

  afterAll(async () => {
    await cleanFixtures();
    await moduleRef.close();
  });

  it('같은 컬럼과 다른 컬럼 이동 모두 서버가 연속 순서를 다시 계산한다', async () => {
    const fixture = await createProjectFixture();
    const backlog = fixture.columns.find(({ name }) => name === 'Backlog');
    const todo = fixture.columns.find(({ name }) => name === 'Todo');
    if (!backlog || !todo) {
      throw new Error('기본 컬럼을 조회하지 못했습니다.');
    }

    const first = await createTicket(fixture.project.id, backlog.id, '첫 번째');
    const second = await createTicket(
      fixture.project.id,
      backlog.id,
      '두 번째',
    );
    const third = await createTicket(fixture.project.id, backlog.id, '세 번째');

    await expect(
      workflow.moveTicket({
        organizationId,
        projectId: fixture.project.id,
        ticketId: third.id,
        targetColumnId: backlog.id,
        beforeTicketId: first.id,
        afterTicketId: null,
      }),
    ).resolves.toMatchObject({
      kind: 'moved',
      ticket: { id: third.id, columnId: backlog.id, position: 0 },
    });

    expect(await ticketOrder(fixture.project.id, backlog.id)).toEqual([
      { id: third.id, position: 0 },
      { id: first.id, position: 1 },
      { id: second.id, position: 2 },
    ]);

    await workflow.moveTicket({
      organizationId,
      projectId: fixture.project.id,
      ticketId: third.id,
      targetColumnId: backlog.id,
      beforeTicketId: null,
      afterTicketId: first.id,
    });
    expect(await ticketOrder(fixture.project.id, backlog.id)).toEqual([
      { id: first.id, position: 0 },
      { id: third.id, position: 1 },
      { id: second.id, position: 2 },
    ]);

    await workflow.moveTicket({
      organizationId,
      projectId: fixture.project.id,
      ticketId: first.id,
      targetColumnId: backlog.id,
      beforeTicketId: null,
      afterTicketId: null,
    });
    expect(await ticketOrder(fixture.project.id, backlog.id)).toEqual([
      { id: third.id, position: 0 },
      { id: second.id, position: 1 },
      { id: first.id, position: 2 },
    ]);

    await expect(
      workflow.moveTicket({
        organizationId,
        projectId: fixture.project.id,
        ticketId: first.id,
        targetColumnId: todo.id,
        beforeTicketId: null,
        afterTicketId: null,
      }),
    ).resolves.toMatchObject({
      kind: 'moved',
      ticket: { id: first.id, columnId: todo.id, position: 0 },
    });

    expect(await ticketOrder(fixture.project.id, backlog.id)).toEqual([
      { id: third.id, position: 0 },
      { id: second.id, position: 1 },
    ]);
    expect(await ticketOrder(fixture.project.id, todo.id)).toEqual([
      { id: first.id, position: 0 },
    ]);
  });

  it('다른 프로젝트 컬럼과 대상 컬럼 밖 기준 티켓을 이동 기준으로 허용하지 않는다', async () => {
    const fixture = await createProjectFixture();
    const backlog = fixture.columns.find(({ name }) => name === 'Backlog');
    const todo = fixture.columns.find(({ name }) => name === 'Todo');
    if (!backlog || !todo) {
      throw new Error('기본 컬럼을 조회하지 못했습니다.');
    }
    const source = await createTicket(
      fixture.project.id,
      backlog.id,
      '이동 대상',
    );
    const wrongReference = await createTicket(
      fixture.project.id,
      backlog.id,
      '잘못된 기준',
    );

    const other = await createProjectFixture({
      organizationId: otherOrganizationId,
      key: 'OTHER',
      name: '다른 프로젝트',
    });
    const otherColumn = other.columns[0];
    if (!otherColumn) {
      throw new Error('다른 프로젝트 컬럼을 조회하지 못했습니다.');
    }

    await expect(
      workflow.moveTicket({
        organizationId,
        projectId: fixture.project.id,
        ticketId: source.id,
        targetColumnId: otherColumn.id,
        beforeTicketId: null,
        afterTicketId: null,
      }),
    ).resolves.toEqual({ kind: 'column_not_found' });

    await expect(
      workflow.moveTicket({
        organizationId,
        projectId: fixture.project.id,
        ticketId: source.id,
        targetColumnId: todo.id,
        beforeTicketId: wrongReference.id,
        afterTicketId: null,
      }),
    ).resolves.toEqual({ kind: 'reference_not_found' });
  });

  it('동시 이동 후에도 대상 컬럼 position은 중복 없이 연속적이다', async () => {
    const fixture = await createProjectFixture();
    const backlog = fixture.columns.find(({ name }) => name === 'Backlog');
    const todo = fixture.columns.find(({ name }) => name === 'Todo');
    if (!backlog || !todo) {
      throw new Error('기본 컬럼을 조회하지 못했습니다.');
    }

    const tickets = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createTicket(fixture.project.id, backlog.id, `동시 이동 ${index + 1}`),
      ),
    );

    const results = await Promise.all(
      tickets.map(({ id }) =>
        workflow.moveTicket({
          organizationId,
          projectId: fixture.project.id,
          ticketId: id,
          targetColumnId: todo.id,
          beforeTicketId: null,
          afterTicketId: null,
        }),
      ),
    );

    expect(results.every(({ kind }) => kind === 'moved')).toBe(true);
    const todoTickets = await ticketRepository.listTickets({
      organizationId,
      projectId: fixture.project.id,
      columnId: todo.id,
    });
    expect(todoTickets).toHaveLength(8);
    expect(todoTickets.map(({ position }) => position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(new Set(todoTickets.map(({ position }) => position)).size).toBe(8);
    await expect(
      ticketRepository.listTickets({
        organizationId,
        projectId: fixture.project.id,
        columnId: backlog.id,
      }),
    ).resolves.toHaveLength(0);
  });

  it('라벨·체크리스트·댓글은 card summary와 detail body를 분리해 조회한다', async () => {
    const fixture = await createProjectFixture();
    const backlog = fixture.columns.find(({ name }) => name === 'Backlog');
    if (!backlog) {
      throw new Error('Backlog 컬럼을 조회하지 못했습니다.');
    }
    const createdTicket = await createTicket(
      fixture.project.id,
      backlog.id,
      '상세 데이터 티켓',
    );

    const label = await workflow.createLabel({
      organizationId,
      projectId: fixture.project.id,
      name: 'Backend',
      color: 'blue',
    });
    if (!label) {
      throw new Error('라벨 생성에 실패했습니다.');
    }
    await workflow.attachLabel({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      labelId: label.id,
    });

    const checklist = await workflow.createChecklist({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      title: '완료 조건',
    });
    if (!checklist) {
      throw new Error('체크리스트 생성에 실패했습니다.');
    }
    const firstItem = await workflow.addChecklistItem({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      checklistId: checklist.checklist.id,
      title: '첫 번째 조건',
    });
    const secondItem = await workflow.addChecklistItem({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      checklistId: checklist.checklist.id,
      title: '두 번째 조건',
    });
    if (!firstItem || !secondItem) {
      throw new Error('체크리스트 항목 생성에 실패했습니다.');
    }
    await workflow.toggleChecklistItem({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      checklistId: checklist.checklist.id,
      itemId: firstItem.id,
      completed: true,
    });
    await workflow.moveChecklistItem({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      checklistId: checklist.checklist.id,
      itemId: secondItem.id,
      beforeItemId: firstItem.id,
      afterItemId: null,
    });

    await workflow.createComment({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      authorUserId: actorUserId,
      contentMarkdown: '**첫 댓글**',
    });
    await workflow.createComment({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      authorUserId: otherUserId,
      contentMarkdown: '두 번째 댓글',
    });

    await expect(
      workflow.loadCardMetadata(organizationId, fixture.project.id, [
        createdTicket.id,
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        ticketId: createdTicket.id,
        labels: [expect.objectContaining({ id: label.id, color: 'blue' })],
        checklistItemTotal: 2,
        checklistItemCompleted: 1,
        commentCount: 2,
      }),
    ]);

    const detail = await workflow.loadDetailChildren(
      organizationId,
      fixture.project.id,
      createdTicket.id,
    );
    expect(detail).not.toBeNull();
    expect(detail?.labels).toEqual([
      expect.objectContaining({ id: label.id, name: 'Backend' }),
    ]);
    expect(detail?.checklists[0]?.items).toEqual([
      expect.objectContaining({
        id: secondItem.id,
        position: 0,
        completed: false,
      }),
      expect.objectContaining({
        id: firstItem.id,
        position: 1,
        completed: true,
      }),
    ]);
    expect(
      detail?.comments.map(({ contentMarkdown }) => contentMarkdown),
    ).toEqual(['**첫 댓글**', '두 번째 댓글']);
  });

  it('라벨·체크리스트·댓글 생명주기는 티켓 범위 안에서 일관되게 반영된다', async () => {
    const fixture = await createProjectFixture();
    const backlog = fixture.columns[0];
    if (!backlog) {
      throw new Error('기본 컬럼을 조회하지 못했습니다.');
    }
    const createdTicket = await createTicket(
      fixture.project.id,
      backlog.id,
      '생명주기 티켓',
    );

    const label = await workflow.createLabel({
      organizationId,
      projectId: fixture.project.id,
      name: 'Lifecycle',
      color: 'green',
    });
    if (!label) {
      throw new Error('lifecycle 라벨 생성에 실패했습니다.');
    }
    await expect(
      workflow.attachLabel({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        labelId: label.id,
      }),
    ).resolves.toMatchObject({ id: label.id });
    await expect(
      workflow.attachLabel({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        labelId: label.id,
      }),
    ).resolves.toMatchObject({ id: label.id });
    await expect(
      workflow.loadCardMetadata(organizationId, fixture.project.id, [
        createdTicket.id,
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        labels: [expect.objectContaining({ id: label.id })],
      }),
    ]);
    await expect(
      workflow.detachLabel({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        labelId: label.id,
      }),
    ).resolves.toBe(true);
    await expect(
      workflow.detachLabel({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        labelId: label.id,
      }),
    ).resolves.toBe(true);

    const checklist = await workflow.createChecklist({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      title: '초기 체크리스트',
    });
    if (!checklist) {
      throw new Error('lifecycle 체크리스트 생성에 실패했습니다.');
    }
    await expect(
      workflow.renameChecklist({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        checklistId: checklist.checklist.id,
        title: '변경된 체크리스트',
      }),
    ).resolves.toMatchObject({
      checklist: { title: '변경된 체크리스트' },
    });

    const item = await workflow.addChecklistItem({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      checklistId: checklist.checklist.id,
      title: '초기 항목',
    });
    if (!item) {
      throw new Error('lifecycle 체크리스트 항목 생성에 실패했습니다.');
    }
    await expect(
      workflow.renameChecklistItem({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        checklistId: checklist.checklist.id,
        itemId: item.id,
        title: '변경된 항목',
      }),
    ).resolves.toMatchObject({ title: '변경된 항목' });
    await expect(
      workflow.toggleChecklistItem({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        checklistId: checklist.checklist.id,
        itemId: item.id,
        completed: true,
      }),
    ).resolves.toMatchObject({ completed: true });
    await expect(
      workflow.removeChecklistItem({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        checklistId: checklist.checklist.id,
        itemId: item.id,
      }),
    ).resolves.toBe(true);
    await expect(
      workflow.removeChecklist({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        checklistId: checklist.checklist.id,
      }),
    ).resolves.toBe(true);

    const comment = await workflow.createComment({
      organizationId,
      projectId: fixture.project.id,
      ticketId: createdTicket.id,
      authorUserId: actorUserId,
      contentMarkdown: '초기 댓글',
    });
    if (!comment) {
      throw new Error('lifecycle 댓글 생성에 실패했습니다.');
    }
    await expect(
      workflow.updateComment({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        commentId: comment.id,
        contentMarkdown: '변경된 댓글',
      }),
    ).resolves.toMatchObject({ contentMarkdown: '변경된 댓글' });
    await expect(
      workflow.listComments(
        organizationId,
        fixture.project.id,
        createdTicket.id,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: comment.id,
        contentMarkdown: '변경된 댓글',
      }),
    ]);
    await expect(
      workflow.removeComment({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        commentId: comment.id,
      }),
    ).resolves.toBe(true);

    const detail = await workflow.loadDetailChildren(
      organizationId,
      fixture.project.id,
      createdTicket.id,
    );
    expect(detail).toMatchObject({
      labels: [],
      checklists: [],
      comments: [],
    });
  });

  it('다른 프로젝트 라벨은 티켓에 연결하지 않는다', async () => {
    const fixture = await createProjectFixture();
    const backlog = fixture.columns[0];
    if (!backlog) {
      throw new Error('기본 컬럼을 조회하지 못했습니다.');
    }
    const createdTicket = await createTicket(
      fixture.project.id,
      backlog.id,
      '라벨 scope 티켓',
    );
    const other = await createProjectFixture({
      organizationId: otherOrganizationId,
      key: 'LABEL',
      name: '다른 라벨 프로젝트',
    });
    const otherLabel = await workflow.createLabel({
      organizationId: otherOrganizationId,
      projectId: other.project.id,
      name: 'Other',
      color: 'red',
    });
    if (!otherLabel) {
      throw new Error('다른 프로젝트 라벨 생성에 실패했습니다.');
    }

    await expect(
      workflow.attachLabel({
        organizationId,
        projectId: fixture.project.id,
        ticketId: createdTicket.id,
        labelId: otherLabel.id,
      }),
    ).resolves.toBeNull();
  });

  async function cleanFixtures(): Promise<void> {
    await database
      .delete(project)
      .where(
        inArray(project.organizationId, [organizationId, otherOrganizationId]),
      );
    await database.delete(user).where(inArray(user.id, userIds));
  }

  async function createProjectFixture(
    overrides: Partial<CreateProjectPersistenceInput> = {},
  ) {
    const created = await projects.createProjectWithDefaultColumns({
      ...baseProjectInput,
      ...overrides,
    });
    const columns = await projectColumns.listColumns(
      created.organizationId,
      created.id,
    );
    return { project: created, columns };
  }

  async function createTicket(
    projectId: string,
    columnId: string,
    title: string,
  ) {
    const result = await ticketRepository.createTicketWithNumber({
      organizationId,
      projectId,
      columnId,
      title,
      descriptionMarkdown: '',
      priority: 'medium',
      assigneeUserId: null,
      reporterUserId: actorUserId,
      dueAt: null,
    });
    if (result.kind !== 'created') {
      throw new Error(`티켓 생성 실패: ${result.kind}`);
    }
    return result.ticket;
  }

  async function ticketOrder(projectId: string, columnId: string) {
    const rows = await ticketRepository.listTickets({
      organizationId,
      projectId,
      columnId,
    });
    return rows.map(({ id, position }) => ({ id, position }));
  }
});
