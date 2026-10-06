import type { AuthUserIdentity } from '#server/auth/auth-user-directory.service.js';
import { OrganizationNotFoundError } from '#server/organizations/domain/organization.error.js';
import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import type { OrganizationMembershipService } from '#server/organizations/organization-membership.service.js';
import {
  ProjectArchivedError,
  ProjectColumnNotFoundError,
  ProjectUserNotMemberError,
} from '#server/projects/domain/project.error.js';
import type { Project } from '#server/projects/domain/project.js';
import type { ProjectColumn } from '#server/projects/domain/project-column.js';
import {
  ProjectRepository,
  type ProjectSummaryReadModel,
} from '#server/projects/infrastructure/persistence/project.repository.js';
import { TicketWorkflowRepository } from '#server/projects/infrastructure/persistence/ticket-workflow.repository.js';
import { ProjectsService } from '#server/projects/projects.service.js';

import { jest } from '@jest/globals';

class FakeProjectRepository extends ProjectRepository {
  listProjects = jest.fn<ProjectRepository['listProjects']>();
  findProjectById = jest.fn<ProjectRepository['findProjectById']>();
  createProjectWithDefaultColumns =
    jest.fn<ProjectRepository['createProjectWithDefaultColumns']>();
  updateProject = jest.fn<ProjectRepository['updateProject']>();
  listColumns = jest.fn<ProjectRepository['listColumns']>();
  findColumnById = jest.fn<ProjectRepository['findColumnById']>();
  createColumn = jest.fn<ProjectRepository['createColumn']>();
  renameColumn = jest.fn<ProjectRepository['renameColumn']>();
  listTickets = jest.fn<ProjectRepository['listTickets']>();
  findTicketById = jest.fn<ProjectRepository['findTicketById']>();
  createTicketWithNumber =
    jest.fn<ProjectRepository['createTicketWithNumber']>();
  updateTicket = jest.fn<ProjectRepository['updateTicket']>();
}

class FakeTicketWorkflowRepository extends TicketWorkflowRepository {
  loadCardMetadata = jest.fn<TicketWorkflowRepository['loadCardMetadata']>();
  loadDetailChildren =
    jest.fn<TicketWorkflowRepository['loadDetailChildren']>();
  moveTicket = jest.fn<TicketWorkflowRepository['moveTicket']>();
  listLabels = jest.fn<TicketWorkflowRepository['listLabels']>();
  createLabel = jest.fn<TicketWorkflowRepository['createLabel']>();
  updateLabel = jest.fn<TicketWorkflowRepository['updateLabel']>();
  attachLabel = jest.fn<TicketWorkflowRepository['attachLabel']>();
  detachLabel = jest.fn<TicketWorkflowRepository['detachLabel']>();
  createChecklist = jest.fn<TicketWorkflowRepository['createChecklist']>();
  renameChecklist = jest.fn<TicketWorkflowRepository['renameChecklist']>();
  removeChecklist = jest.fn<TicketWorkflowRepository['removeChecklist']>();
  addChecklistItem = jest.fn<TicketWorkflowRepository['addChecklistItem']>();
  renameChecklistItem =
    jest.fn<TicketWorkflowRepository['renameChecklistItem']>();
  toggleChecklistItem =
    jest.fn<TicketWorkflowRepository['toggleChecklistItem']>();
  moveChecklistItem = jest.fn<TicketWorkflowRepository['moveChecklistItem']>();
  removeChecklistItem =
    jest.fn<TicketWorkflowRepository['removeChecklistItem']>();
  listComments = jest.fn<TicketWorkflowRepository['listComments']>();
  findComment = jest.fn<TicketWorkflowRepository['findComment']>();
  createComment = jest.fn<TicketWorkflowRepository['createComment']>();
  updateComment = jest.fn<TicketWorkflowRepository['updateComment']>();
  removeComment = jest.fn<TicketWorkflowRepository['removeComment']>();
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
  providerCredential: {},
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
  let repository: FakeProjectRepository;
  let workflowRepository: FakeTicketWorkflowRepository;
  let membership: {
    requireAccess: jest.MockedFunction<MembershipBoundary['requireAccess']>;
    hasMemberUser: jest.MockedFunction<MembershipBoundary['hasMemberUser']>;
  };
  let userDirectory: {
    findByIds: jest.MockedFunction<UserDirectory['findByIds']>;
  };
  let service: ProjectsService;

  beforeEach(() => {
    repository = new FakeProjectRepository();
    workflowRepository = new FakeTicketWorkflowRepository();
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
    workflowRepository.loadCardMetadata.mockResolvedValue([]);
    workflowRepository.loadDetailChildren.mockResolvedValue({
      labels: [],
      checklists: [],
      comments: [],
    });
    service = new ProjectsService(
      repository,
      workflowRepository,
      membership,
      userDirectory,
    );
  });

  it('프로젝트 목록은 lead 사용자를 한 번에 조회하고 실제 통계를 반환한다', async () => {
    const leadUserId = 'lead-user';
    repository.listProjects.mockResolvedValue([
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

    const result = await service.listProjects(context, organizationId);

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
      service.createProject(context, organizationId, {
        key: 'OS',
        name: '운영 시스템',
        leadUserId: 'outsider-user',
      }),
    ).rejects.toBeInstanceOf(ProjectUserNotMemberError);

    expect(repository.createProjectWithDefaultColumns).not.toHaveBeenCalled();
  });

  it('현재 조직 멤버가 아닌 assignee는 티켓 생성 전에 거부한다', async () => {
    repository.findProjectById.mockResolvedValue(projectModel());
    membership.hasMemberUser.mockResolvedValue(false);

    await expect(
      service.createTicket(context, organizationId, projectId, {
        columnId,
        title: '티켓',
        assigneeUserId: 'outsider-user',
      }),
    ).rejects.toBeInstanceOf(ProjectUserNotMemberError);

    expect(repository.createTicketWithNumber).not.toHaveBeenCalled();
  });

  it('빈 사용자 식별자도 미지정 값으로 우회시키지 않는다', async () => {
    repository.findProjectById.mockResolvedValue(projectModel());
    membership.hasMemberUser.mockResolvedValue(false);

    await expect(
      service.createTicket(context, organizationId, projectId, {
        columnId,
        title: '티켓',
        assigneeUserId: '',
      }),
    ).rejects.toBeInstanceOf(ProjectUserNotMemberError);

    expect(membership.hasMemberUser).toHaveBeenCalledWith(organizationId, '');
    expect(repository.createTicketWithNumber).not.toHaveBeenCalled();
  });

  it('조직 접근 검증이 실패하면 프로젝트 저장소를 호출하지 않는다', async () => {
    membership.requireAccess.mockRejectedValue(new OrganizationNotFoundError());

    await expect(
      service.listProjects(context, organizationId),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(repository.listProjects).not.toHaveBeenCalled();
  });

  it('다른 프로젝트의 컬럼 필터는 티켓 조회에 사용하지 않는다', async () => {
    repository.findProjectById.mockResolvedValue(projectModel());
    repository.findColumnById.mockResolvedValue(null);

    await expect(
      service.listTickets(context, organizationId, projectId, { columnId }),
    ).rejects.toBeInstanceOf(ProjectColumnNotFoundError);

    expect(repository.listTickets).not.toHaveBeenCalled();
  });

  it('보관된 프로젝트에서는 컬럼 생성 같은 write를 거부한다', async () => {
    repository.findProjectById.mockResolvedValue(
      projectModel({ archivedAt: new Date('2026-10-06T01:00:00.000Z') }),
    );
    repository.createColumn.mockResolvedValue(column());

    await expect(
      service.createColumn(context, organizationId, projectId, {
        name: '추가 컬럼',
      }),
    ).rejects.toBeInstanceOf(ProjectArchivedError);

    expect(repository.createColumn).not.toHaveBeenCalled();
  });
});
