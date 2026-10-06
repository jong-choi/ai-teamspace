import { Test, type TestingModule } from '@nestjs/testing';

import { user } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import { ProjectKeyConflictError } from '@/projects/domain/project.error';
import type { CreateProjectInput } from '@/projects/dto/create-project.dto';
import type { CreateTicketInput } from '@/projects/dto/create-ticket.dto';
import type { QueryTicketsInput } from '@/projects/dto/query-tickets.dto';
import type { UpdateTicketInput } from '@/projects/dto/update-ticket.dto';
import { ProjectDrizzlePersistenceModule } from '@/projects/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';

import { eq, inArray } from 'drizzle-orm';

const organizationId = 'project-repository-organization';
const otherOrganizationId = 'project-repository-other-organization';
const actorUserId = 'project-repository-actor';
const assigneeUserId = 'project-repository-assignee';
const userIds = [actorUserId, assigneeUserId] as const;

const createProjectInput = {
  key: 'OS',
  name: '운영 시스템',
  description: '프로젝트 저장소 통합 테스트',
  leadUserId: assigneeUserId,
} satisfies CreateProjectInput;

describe('프로젝트 Drizzle 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let projects: ProjectRepository;
  let columns: ProjectColumnRepository;
  let tickets: TicketRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, ProjectDrizzlePersistenceModule],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    projects = moduleRef.get(ProjectRepository);
    columns = moduleRef.get(ProjectColumnRepository);
    tickets = moduleRef.get(TicketRepository);
  });

  beforeEach(async () => {
    await database
      .delete(project)
      .where(
        inArray(project.organizationId, [organizationId, otherOrganizationId]),
      );
    await database.delete(user).where(inArray(user.id, userIds));
    await database.insert(user).values([
      {
        id: actorUserId,
        name: '프로젝트 저장소 사용자',
        email: 'project-repository-actor@example.com',
        username: 'projectrepositoryactor',
      },
      {
        id: assigneeUserId,
        name: '프로젝트 담당자',
        email: 'project-repository-assignee@example.com',
        username: 'projectrepositoryassignee',
      },
    ]);
  });

  afterAll(async () => {
    await database
      .delete(project)
      .where(
        inArray(project.organizationId, [organizationId, otherOrganizationId]),
      );
    await database.delete(user).where(inArray(user.id, userIds));
    await moduleRef.close();
  });

  it('프로젝트 생성은 기본 컬럼을 같은 트랜잭션에서 순서대로 만든다', async () => {
    const created = await createProject();

    const createdColumns = await columns.listColumns(
      organizationId,
      created.id,
    );

    expect(
      createdColumns.map(({ name, position, isCompleted }) => ({
        name,
        position,
        isCompleted,
      })),
    ).toEqual([
      { name: 'Backlog', position: 0, isCompleted: false },
      { name: 'Todo', position: 1, isCompleted: false },
      { name: 'In Progress', position: 2, isCompleted: false },
      { name: 'In Review', position: 3, isCompleted: false },
      { name: 'Done', position: 4, isCompleted: true },
    ]);
  });

  it('프로젝트 키는 조직 안에서만 유일하고 충돌을 도메인 오류로 변환한다', async () => {
    await createProject();

    await expect(
      createProject({
        ...createProjectInput,
        name: '중복 키 프로젝트',
      }),
    ).rejects.toBeInstanceOf(ProjectKeyConflictError);

    await expect(
      createProject(
        {
          ...createProjectInput,
          name: '다른 조직의 같은 키',
        },
        otherOrganizationId,
      ),
    ).resolves.toMatchObject({ key: 'OS' });
  });

  it('동시에 생성한 티켓도 프로젝트 번호를 중복 없이 원자적으로 배정한다', async () => {
    const createdProject = await createProject();
    const [column] = await columns.listColumns(
      organizationId,
      createdProject.id,
    );
    if (!column) {
      throw new Error('기본 프로젝트 컬럼을 조회하지 못했습니다.');
    }

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createTicket(createdProject.id, {
          columnId: column.id,
          title: `동시 생성 티켓 ${index + 1}`,
          descriptionMarkdown: '',
          priority: 'medium',
          assigneeUserId,
          dueAt: null,
        }),
      ),
    );

    const numbers = results
      .map((result) => {
        if (result.kind !== 'created') {
          throw new Error(`티켓 생성 실패: ${result.kind}`);
        }
        return result.ticket.number;
      })
      .sort((left, right) => left - right);

    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(
      projects.findProjectById(organizationId, createdProject.id),
    ).resolves.toMatchObject({ project: { nextTicketNumber: 9 } });
  });

  it('티켓 조회는 조직·프로젝트 범위를 지키며 검색과 필터를 함께 적용한다', async () => {
    const createdProject = await createProject();
    const projectColumns = await columns.listColumns(
      organizationId,
      createdProject.id,
    );
    const todoColumn = projectColumns.find(({ name }) => name === 'Todo');
    const doneColumn = projectColumns.find(({ name }) => name === 'Done');
    if (!todoColumn || !doneColumn) {
      throw new Error('필요한 기본 컬럼을 조회하지 못했습니다.');
    }

    const first = await createTicket(createdProject.id, {
      columnId: todoColumn.id,
      title: '로그인 API 개선',
      descriptionMarkdown: '인증 흐름을 정리한다.',
      priority: 'high',
      assigneeUserId,
      dueAt: null,
    });
    const second = await createTicket(createdProject.id, {
      columnId: doneColumn.id,
      title: '문서 정리',
      descriptionMarkdown: '로그인 가이드를 갱신한다.',
      priority: 'low',
      assigneeUserId: null,
      dueAt: null,
    });
    if (first.kind !== 'created' || second.kind !== 'created') {
      throw new Error('필터 테스트 티켓 생성에 실패했습니다.');
    }

    await expect(
      listTickets(createdProject.id, {
        search: '로그인',
        columnId: todoColumn.id,
        assigneeUserId,
        priority: 'high',
      }),
    ).resolves.toEqual([expect.objectContaining({ id: first.ticket.id })]);

    await expect(
      listTickets(createdProject.id, {}, otherOrganizationId),
    ).resolves.toEqual([]);

    const summary = await projects.findProjectById(
      organizationId,
      createdProject.id,
    );
    expect(summary).toMatchObject({
      activeTicketCount: 1,
      doneTicketCount: 1,
    });

    const [doneRow] = await database
      .select({ isCompleted: projectColumn.isCompleted })
      .from(projectColumn)
      .where(eq(projectColumn.id, doneColumn.id));
    expect(doneRow?.isCompleted).toBe(true);
  });

  it('티켓의 여러 변경을 단일 capability로 원자적으로 적용한다', async () => {
    const createdProject = await createProject();
    const [column] = await columns.listColumns(
      organizationId,
      createdProject.id,
    );
    if (!column) {
      throw new Error('기본 프로젝트 컬럼을 조회하지 못했습니다.');
    }
    const ticketResult = await createTicket(createdProject.id, {
      columnId: column.id,
      title: '초기 제목',
      descriptionMarkdown: '초기 설명',
      priority: 'low',
      assigneeUserId: null,
      dueAt: null,
    });
    if (ticketResult.kind !== 'created') {
      throw new Error('변경 capability 테스트 티켓 생성에 실패했습니다.');
    }
    const dueAt = new Date('2026-10-10T03:00:00.000Z');

    await expect(
      updateTicket(createdProject.id, ticketResult.ticket.id, {
        title: '변경된 제목',
        descriptionMarkdown: '변경된 설명',
        priority: 'urgent',
        assigneeUserId,
        dueAt: dueAt.toISOString(),
      }),
    ).resolves.toMatchObject({
      title: '변경된 제목',
      descriptionMarkdown: '변경된 설명',
      priority: 'urgent',
      assigneeUserId,
      dueAt,
    });
  });

  it('보관된 티켓은 일반 변경을 거부하고 복원 후 다시 변경할 수 있다', async () => {
    const createdProject = await createProject();
    const [column] = await columns.listColumns(
      organizationId,
      createdProject.id,
    );
    if (!column) {
      throw new Error('기본 프로젝트 컬럼을 조회하지 못했습니다.');
    }
    const ticketResult = await createTicket(createdProject.id, {
      columnId: column.id,
      title: '보관 대상 티켓',
      descriptionMarkdown: '',
      priority: 'medium',
      assigneeUserId: null,
      dueAt: null,
    });
    if (ticketResult.kind !== 'created') {
      throw new Error('보관 테스트 티켓 생성에 실패했습니다.');
    }

    await updateTicket(createdProject.id, ticketResult.ticket.id, {
      archived: true,
    });

    await expect(
      updateTicket(createdProject.id, ticketResult.ticket.id, {
        priority: 'urgent',
      }),
    ).resolves.toBeNull();

    await expect(
      updateTicket(createdProject.id, ticketResult.ticket.id, {
        archived: false,
      }),
    ).resolves.toMatchObject({ archivedAt: null });

    await expect(
      updateTicket(createdProject.id, ticketResult.ticket.id, {
        priority: 'urgent',
      }),
    ).resolves.toMatchObject({ priority: 'urgent' });
  });

  it('티켓 보관은 활성 순서를 압축하고 복원은 컬럼 끝에 배치한다', async () => {
    const createdProject = await createProject();
    const [column] = await columns.listColumns(
      organizationId,
      createdProject.id,
    );
    if (!column) {
      throw new Error('기본 프로젝트 컬럼을 조회하지 못했습니다.');
    }

    const createdTickets = [];
    for (const title of ['첫 번째', '두 번째', '세 번째']) {
      const result = await createTicket(createdProject.id, {
        columnId: column.id,
        title,
        descriptionMarkdown: '',
        priority: 'medium',
        assigneeUserId: null,
        dueAt: null,
      });
      if (result.kind !== 'created') {
        throw new Error(`보관 순서 테스트 티켓 생성 실패: ${result.kind}`);
      }
      createdTickets.push(result.ticket);
    }
    const [first, second, third] = createdTickets;
    if (!first || !second || !third) {
      throw new Error('보관 순서 테스트 티켓을 준비하지 못했습니다.');
    }

    await updateTicket(createdProject.id, second.id, { archived: true });

    await expect(
      listTickets(createdProject.id, {
        columnId: column.id,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: first.id, position: 0 }),
      expect.objectContaining({ id: third.id, position: 1 }),
    ]);

    await updateTicket(createdProject.id, second.id, { archived: false });

    await expect(
      listTickets(createdProject.id, {
        columnId: column.id,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: first.id, position: 0 }),
      expect.objectContaining({ id: third.id, position: 1 }),
      expect.objectContaining({ id: second.id, position: 2 }),
    ]);
  });

  it('보관된 프로젝트에는 repository write도 적용하지 않는다', async () => {
    const createdProject = await createProject();
    const [column] = await columns.listColumns(
      organizationId,
      createdProject.id,
    );
    if (!column) {
      throw new Error('기본 프로젝트 컬럼을 조회하지 못했습니다.');
    }
    const ticketResult = await createTicket(createdProject.id, {
      columnId: column.id,
      title: '보관 전 티켓',
      descriptionMarkdown: '',
      priority: 'medium',
      assigneeUserId: null,
      dueAt: null,
    });
    if (ticketResult.kind !== 'created') {
      throw new Error('보관 테스트 티켓 생성에 실패했습니다.');
    }

    await projects.updateProject(organizationId, createdProject.id, {
      archived: true,
    });

    await expect(
      projects.updateProject(organizationId, createdProject.id, {
        name: '변경 금지',
      }),
    ).resolves.toBeNull();
    await expect(
      columns.renameColumn(
        organizationId,
        createdProject.id,
        column.id,
        '변경 금지',
      ),
    ).resolves.toBeNull();
    await expect(
      updateTicket(createdProject.id, ticketResult.ticket.id, {
        priority: 'urgent',
      }),
    ).resolves.toBeNull();
  });

  function createProject(
    input: CreateProjectInput = createProjectInput,
    targetOrganizationId = organizationId,
  ) {
    return projects.createProjectWithDefaultColumns(
      targetOrganizationId,
      actorUserId,
      input,
    );
  }

  function createTicket(projectId: string, input: CreateTicketInput) {
    return tickets.createTicketWithNumber(
      organizationId,
      projectId,
      actorUserId,
      input,
    );
  }

  function listTickets(
    projectId: string,
    input: QueryTicketsInput,
    targetOrganizationId = organizationId,
  ) {
    return tickets.listTickets(targetOrganizationId, projectId, input);
  }

  function updateTicket(
    projectId: string,
    ticketId: string,
    input: UpdateTicketInput,
  ) {
    return tickets.updateTicket(organizationId, projectId, ticketId, input);
  }
});
