import type { AuthUserIdentity } from '@/auth/auth-user-directory.service';
import { OrganizationNotFoundError } from '@/organizations/domain/organization.error';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import type { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import {
  ProjectArchivedError,
  ProjectColumnNotFoundError,
  ProjectUserNotMemberError,
} from '@/projects/domain/project.error';
import type { Project } from '@/projects/domain/project';
import type { ProjectColumn } from '@/projects/domain/project-column';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import {
  ProjectRepository,
  type ProjectSummaryReadModel,
} from '@/projects/infrastructure/persistence/project.repository';
import { TicketDetailQueryRepository } from '@/projects/infrastructure/persistence/ticket-detail-query.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';
import { ProjectColumnsService } from '@/projects/project-columns.service';
import { ProjectsService } from '@/projects/projects.service';
import { ProjectResourceLoader } from '@/projects/project-resource.loader';
import { ProjectUserResolver } from '@/projects/project-user.resolver';
import { TicketsService } from '@/projects/tickets.service';

import { jest } from '@jest/globals';

class FakeProjectRepository extends ProjectRepository {
  listProjects = jest.fn<ProjectRepository['listProjects']>();
  findProjectById = jest.fn<ProjectRepository['findProjectById']>();
  createProjectWithDefaultColumns =
    jest.fn<ProjectRepository['createProjectWithDefaultColumns']>();
  updateProject = jest.fn<ProjectRepository['updateProject']>();
}

class FakeProjectColumnRepository extends ProjectColumnRepository {
  listColumns = jest.fn<ProjectColumnRepository['listColumns']>();
  findColumnById = jest.fn<ProjectColumnRepository['findColumnById']>();
  createColumn = jest.fn<ProjectColumnRepository['createColumn']>();
  renameColumn = jest.fn<ProjectColumnRepository['renameColumn']>();
}

class FakeTicketRepository extends TicketRepository {
  listTickets = jest.fn<TicketRepository['listTickets']>();
  findTicketById = jest.fn<TicketRepository['findTicketById']>();
  createTicketWithNumber =
    jest.fn<TicketRepository['createTicketWithNumber']>();
  updateTicket = jest.fn<TicketRepository['updateTicket']>();
}

class FakeTicketDetailQueryRepository extends TicketDetailQueryRepository {
  loadCardMetadata = jest.fn<TicketDetailQueryRepository['loadCardMetadata']>();
  loadDetailChildren =
    jest.fn<TicketDetailQueryRepository['loadDetailChildren']>();
}

type MembershipBoundary = Pick<
  OrganizationMembershipService,
  'requireAccess' | 'hasMemberUser'
>;

type UserDirectory = {
  findByIds(userIds: readonly string[]): Promise<AuthUserIdentity[]>;
};

const context: OrganizationActorContext = {
  userId: 'actor-user',
};
const organizationId = 'organization-a';
const projectId = '11111111-1111-4111-8111-111111111111';
const columnId = '22222222-2222-4222-8222-222222222222';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: projectId,
    organizationId,
    key: 'OS',
    name: '운영 시스템',
    description: '',
    leadUserId: null,
    createdByUserId: context.userId,
    nextTicketNumber: 1,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    archivedAt: null,
    ...overrides,
  };
}

function projectModel(
  overrides: Partial<Project> = {},
): ProjectSummaryReadModel {
  return {
    project: project(overrides),
    activeTicketCount: 2,
    doneTicketCount: 1,
  };
}

function column(): ProjectColumn {
  return {
    id: columnId,
    projectId,
    name: 'Todo',
    position: 1,
    isCompleted: false,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
  };
}

function user(id: string): AuthUserIdentity {
  return {
    id,
    name: `${id} 이름`,
    email: `${id}@example.com`,
    username: id,
    image: null,
  };
}

describe('프로젝트 서비스', () => {
  let projectRepository: FakeProjectRepository;
  let projectColumnRepository: FakeProjectColumnRepository;
  let ticketRepository: FakeTicketRepository;
  let detailQueryRepository: FakeTicketDetailQueryRepository;
  let membership: {
    requireAccess: jest.MockedFunction<MembershipBoundary['requireAccess']>;
    hasMemberUser: jest.MockedFunction<MembershipBoundary['hasMemberUser']>;
  };
  let userDirectory: {
    findByIds: jest.MockedFunction<UserDirectory['findByIds']>;
  };
  let projectsService: ProjectsService;
  let projectColumnsService: ProjectColumnsService;
  let ticketsService: TicketsService;

  beforeEach(() => {
    projectRepository = new FakeProjectRepository();
    projectColumnRepository = new FakeProjectColumnRepository();
    ticketRepository = new FakeTicketRepository();
    detailQueryRepository = new FakeTicketDetailQueryRepository();
    membership = {
      requireAccess: jest.fn<MembershipBoundary['requireAccess']>(),
      hasMemberUser: jest.fn<MembershipBoundary['hasMemberUser']>(),
    };
    userDirectory = {
      findByIds: jest.fn<UserDirectory['findByIds']>(),
    };
    membership.requireAccess.mockResolvedValue({
      organization: {
        id: organizationId,
        name: '조직 A',
        slug: 'organization-a',
        logo: null,
        createdAt: '2026-10-06T00:00:00.000Z',
      },
      role: 'member',
    });
    membership.hasMemberUser.mockResolvedValue(true);
    userDirectory.findByIds.mockResolvedValue([]);
    detailQueryRepository.loadCardMetadata.mockResolvedValue([]);
    detailQueryRepository.loadDetailChildren.mockResolvedValue({
      labels: [],
      checklists: [],
      comments: [],
    });
    const resourceLoader = new ProjectResourceLoader(
      projectRepository,
      projectColumnRepository,
      ticketRepository,
    );
    const userResolver = new ProjectUserResolver(userDirectory);
    projectsService = new ProjectsService(
      projectRepository,
      resourceLoader,
      membership,
      userResolver,
    );
    projectColumnsService = new ProjectColumnsService(
      projectColumnRepository,
      resourceLoader,
      membership,
    );
    ticketsService = new TicketsService(
      ticketRepository,
      detailQueryRepository,
      resourceLoader,
      membership,
      userResolver,
    );
  });

  it('프로젝트 목록은 lead 사용자를 한 번에 조회하고 실제 통계를 반환한다', async () => {
    const leadUserId = 'lead-user';
    projectRepository.listProjects.mockResolvedValue([
      projectModel({ leadUserId }),
      {
        project: project({
          id: '33333333-3333-4333-8333-333333333333',
          key: 'WEB',
          leadUserId,
        }),
        activeTicketCount: 4,
        doneTicketCount: 3,
      },
    ]);
    userDirectory.findByIds.mockResolvedValue([user(leadUserId)]);

    const result = await projectsService.listProjects(context, organizationId);

    expect(userDirectory.findByIds).toHaveBeenCalledWith([leadUserId]);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      key: 'OS',
      activeTicketCount: 2,
      doneTicketCount: 1,
      lead: { userId: leadUserId },
    });
  });

  it('현재 조직 멤버가 아닌 lead는 프로젝트 생성 전에 거부한다', async () => {
    membership.hasMemberUser.mockResolvedValue(false);

    await expect(
      projectsService.createProject(context, organizationId, {
        key: 'OS',
        name: '운영 시스템',
        leadUserId: 'outsider-user',
      }),
    ).rejects.toBeInstanceOf(ProjectUserNotMemberError);

    expect(
      projectRepository.createProjectWithDefaultColumns,
    ).not.toHaveBeenCalled();
  });

  it('현재 조직 멤버가 아닌 assignee는 티켓 생성 전에 거부한다', async () => {
    projectRepository.findProjectById.mockResolvedValue(projectModel());
    membership.hasMemberUser.mockResolvedValue(false);

    await expect(
      ticketsService.createTicket(context, organizationId, projectId, {
        columnId,
        title: '티켓',
        assigneeUserId: 'outsider-user',
      }),
    ).rejects.toBeInstanceOf(ProjectUserNotMemberError);

    expect(ticketRepository.createTicketWithNumber).not.toHaveBeenCalled();
  });

  it('빈 사용자 식별자도 미지정 값으로 우회시키지 않는다', async () => {
    projectRepository.findProjectById.mockResolvedValue(projectModel());
    membership.hasMemberUser.mockResolvedValue(false);

    await expect(
      ticketsService.createTicket(context, organizationId, projectId, {
        columnId,
        title: '티켓',
        assigneeUserId: '',
      }),
    ).rejects.toBeInstanceOf(ProjectUserNotMemberError);

    expect(membership.hasMemberUser).toHaveBeenCalledWith(organizationId, '');
    expect(ticketRepository.createTicketWithNumber).not.toHaveBeenCalled();
  });

  it('조직 접근 검증이 실패하면 프로젝트 저장소를 호출하지 않는다', async () => {
    membership.requireAccess.mockRejectedValue(new OrganizationNotFoundError());

    await expect(
      projectsService.listProjects(context, organizationId),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(projectRepository.listProjects).not.toHaveBeenCalled();
  });

  it('다른 프로젝트의 컬럼 필터는 티켓 조회에 사용하지 않는다', async () => {
    projectRepository.findProjectById.mockResolvedValue(projectModel());
    projectColumnRepository.findColumnById.mockResolvedValue(null);

    await expect(
      ticketsService.listTickets(context, organizationId, projectId, {
        columnId,
      }),
    ).rejects.toBeInstanceOf(ProjectColumnNotFoundError);

    expect(ticketRepository.listTickets).not.toHaveBeenCalled();
  });

  it('보관된 프로젝트에서는 컬럼 생성 같은 write를 거부한다', async () => {
    projectRepository.findProjectById.mockResolvedValue(
      projectModel({ archivedAt: new Date('2026-10-06T01:00:00.000Z') }),
    );
    projectColumnRepository.createColumn.mockResolvedValue(column());

    await expect(
      projectColumnsService.createColumn(context, organizationId, projectId, {
        name: '추가 컬럼',
      }),
    ).rejects.toBeInstanceOf(ProjectArchivedError);

    expect(projectColumnRepository.createColumn).not.toHaveBeenCalled();
  });
});
