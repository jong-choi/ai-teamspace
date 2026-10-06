import type { AuthUserIdentity } from '@/auth/auth-user-directory.service';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import type { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import {
  TicketChecklistNotFoundError,
  TicketCommentAuthorRequiredError,
  TicketLabelNotFoundError,
  TicketMoveReferenceInvalidError,
} from '@/projects/domain/project.error';
import type { Project } from '@/projects/domain/project';
import type { Ticket } from '@/projects/domain/ticket';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import {
  ProjectRepository,
  type ProjectSummaryReadModel,
} from '@/projects/infrastructure/persistence/project.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';
import { TicketWorkflowRepository } from '@/projects/infrastructure/persistence/ticket-workflow.repository';
import { ProjectResourceLoader } from '@/projects/project-resource.loader';
import { ProjectUserResolver } from '@/projects/project-user.resolver';
import { TicketChecklistsService } from '@/projects/ticket-checklists.service';
import { TicketCommentsService } from '@/projects/ticket-comments.service';
import { TicketLabelsService } from '@/projects/ticket-labels.service';
import { TicketOrderingService } from '@/projects/ticket-ordering.service';
import { TicketWorkflowAccessPolicy } from '@/projects/ticket-workflow-access.policy';

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

type MembershipBoundary = Pick<OrganizationMembershipService, 'requireAccess'>;
type UserDirectory = Pick<
  { findByIds(userIds: readonly string[]): Promise<AuthUserIdentity[]> },
  'findByIds'
>;

const organizationId = 'organization-a';
const projectId = '11111111-1111-4111-8111-111111111111';
const columnId = '22222222-2222-4222-8222-222222222222';
const ticketId = '44444444-4444-4444-8444-444444444444';
const labelId = '55555555-5555-4555-8555-555555555555';
const checklistId = '66666666-6666-4666-8666-666666666666';
const commentId = '77777777-7777-4777-8777-777777777777';
const context: OrganizationActorContext = {
  userId: 'actor-user',
  providerCredential: {},
};

function project(): ProjectSummaryReadModel {
  const value: Project = {
    id: projectId,
    organizationId,
    key: 'OS',
    name: '운영 시스템',
    description: '',
    leadUserId: null,
    createdByUserId: context.userId,
    nextTicketNumber: 2,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    archivedAt: null,
  };
  return { project: value, activeTicketCount: 1, doneTicketCount: 0 };
}

function ticket(): Ticket {
  return {
    id: ticketId,
    organizationId,
    projectId,
    columnId,
    number: 1,
    title: '티켓',
    descriptionMarkdown: '',
    priority: 'medium',
    assigneeUserId: null,
    reporterUserId: context.userId,
    position: 0,
    dueAt: null,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    archivedAt: null,
  };
}

describe('티켓 워크플로 application 서비스', () => {
  let projects: FakeProjectRepository;
  let columns: FakeProjectColumnRepository;
  let tickets: FakeTicketRepository;
  let workflow: FakeTicketWorkflowRepository;
  let membership: {
    requireAccess: jest.MockedFunction<MembershipBoundary['requireAccess']>;
  };
  let userDirectory: {
    findByIds: jest.MockedFunction<UserDirectory['findByIds']>;
  };
  let orderingService: TicketOrderingService;
  let labelsService: TicketLabelsService;
  let checklistsService: TicketChecklistsService;
  let commentsService: TicketCommentsService;

  beforeEach(() => {
    projects = new FakeProjectRepository();
    columns = new FakeProjectColumnRepository();
    tickets = new FakeTicketRepository();
    workflow = new FakeTicketWorkflowRepository();
    membership = {
      requireAccess: jest.fn<MembershipBoundary['requireAccess']>(),
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
    userDirectory.findByIds.mockResolvedValue([]);
    projects.findProjectById.mockResolvedValue(project());
    tickets.findTicketById.mockResolvedValue(ticket());
    const accessPolicy = new TicketWorkflowAccessPolicy(
      new ProjectResourceLoader(projects, columns, tickets),
      membership,
    );
    orderingService = new TicketOrderingService(workflow, accessPolicy);
    labelsService = new TicketLabelsService(workflow, accessPolicy);
    checklistsService = new TicketChecklistsService(workflow, accessPolicy);
    commentsService = new TicketCommentsService(
      workflow,
      accessPolicy,
      new ProjectUserResolver(userDirectory),
    );
  });

  it('move 기준 티켓이 대상 컬럼에 없으면 명시적 오류로 변환한다', async () => {
    workflow.moveTicket.mockResolvedValue({ kind: 'reference_not_found' });

    await expect(
      orderingService.moveTicket(context, organizationId, projectId, ticketId, {
        targetColumnId: columnId,
        beforeTicketId: '88888888-8888-4888-8888-888888888888',
      }),
    ).rejects.toBeInstanceOf(TicketMoveReferenceInvalidError);

    expect(workflow.moveTicket).toHaveBeenCalledWith({
      organizationId,
      projectId,
      ticketId,
      targetColumnId: columnId,
      beforeTicketId: '88888888-8888-4888-8888-888888888888',
      afterTicketId: null,
    });
  });

  it('다른 프로젝트 라벨을 티켓에 붙이려는 요청을 거부한다', async () => {
    workflow.attachLabel.mockResolvedValue(null);

    await expect(
      labelsService.attachLabel(
        context,
        organizationId,
        projectId,
        ticketId,
        labelId,
      ),
    ).rejects.toBeInstanceOf(TicketLabelNotFoundError);
  });

  it('다른 티켓 체크리스트에는 항목을 추가하지 않는다', async () => {
    workflow.addChecklistItem.mockResolvedValue(null);

    await expect(
      checklistsService.addChecklistItem(
        context,
        organizationId,
        projectId,
        ticketId,
        checklistId,
        { title: '하위 작업' },
      ),
    ).rejects.toBeInstanceOf(TicketChecklistNotFoundError);
  });

  it('댓글 작성자가 아니면 댓글을 수정할 수 없다', async () => {
    workflow.findComment.mockResolvedValue({
      id: commentId,
      ticketId,
      authorUserId: 'other-user',
      contentMarkdown: '기존 댓글',
      createdAt: new Date('2026-10-06T00:00:00.000Z'),
      updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    });

    await expect(
      commentsService.updateComment(
        context,
        organizationId,
        projectId,
        ticketId,
        commentId,
        { contentMarkdown: '수정 시도' },
      ),
    ).rejects.toBeInstanceOf(TicketCommentAuthorRequiredError);

    expect(workflow.updateComment).not.toHaveBeenCalled();
  });
});
