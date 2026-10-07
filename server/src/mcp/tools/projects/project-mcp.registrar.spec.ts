import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { ProjectMcpRegistrar } from '@/mcp/tools/projects/project-mcp.registrar';
import type { ProjectsService } from '@/projects/projects.service';
import type { TicketOrderingService } from '@/projects/ticket-ordering.service';
import type { TicketsService } from '@/projects/tickets.service';

const auth: McpAuthContext = {
  authMethod: 'oauth',
  credentialId: null,
  userId: 'user-a',
  clientId: 'client-a',
  scopes: ['projects:read', 'projects:write'],
  allowedOrganizationIds: null,
};

const allow = async () => undefined;
const stop = new Error('service 호출까지만 검증');

describe('Projects MCP registrar', () => {
  const listProjects = jest.fn<
    ReturnType<ProjectsService['listProjects']>,
    Parameters<ProjectsService['listProjects']>
  >();
  const getProject = jest.fn<
    ReturnType<ProjectsService['getProject']>,
    Parameters<ProjectsService['getProject']>
  >();
  const getTicket = jest.fn<
    ReturnType<TicketsService['getTicket']>,
    Parameters<TicketsService['getTicket']>
  >();
  const createTicket = jest.fn<
    ReturnType<TicketsService['createTicket']>,
    Parameters<TicketsService['createTicket']>
  >();
  const updateTicket = jest.fn<
    ReturnType<TicketsService['updateTicket']>,
    Parameters<TicketsService['updateTicket']>
  >();
  const moveTicket = jest.fn<
    ReturnType<TicketOrderingService['moveTicket']>,
    Parameters<TicketOrderingService['moveTicket']>
  >();

  const registrar = new ProjectMcpRegistrar(
    { listProjects, getProject },
    { getTicket, createTicket, updateTicket },
    { moveTicket },
  );

  beforeEach(() => {
    jest.clearAllMocks();
    for (const mock of [
      listProjects,
      getProject,
      getTicket,
      createTicket,
      updateTicket,
      moveTicket,
    ]) {
      mock.mockRejectedValue(stop);
    }
  });

  it('프로젝트 목록은 actor와 organizationId를 전달한다', async () => {
    await expect(
      registrar.tools()[0]!.invoke({ organizationId: 'org-a' }, auth, allow),
    ).rejects.toBe(stop);

    expect(listProjects).toHaveBeenCalledWith({ userId: 'user-a' }, 'org-a');
  });

  it('프로젝트 조회는 project identity를 분리해 전달한다', async () => {
    await expect(
      registrar
        .tools()[1]!
        .invoke(
          { organizationId: 'org-a', projectId: 'project-a' },
          auth,
          allow,
        ),
    ).rejects.toBe(stop);

    expect(getProject).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      'project-a',
    );
  });

  it('티켓 조회는 organization/project/ticket identity를 전달한다', async () => {
    await expect(
      registrar.tools()[2]!.invoke(
        {
          organizationId: 'org-a',
          projectId: 'project-a',
          ticketId: 'ticket-a',
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(getTicket).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      'project-a',
      'ticket-a',
    );
  });

  it('티켓 생성은 identity와 DTO body를 분리한다', async () => {
    await expect(
      registrar.tools()[3]!.invoke(
        {
          organizationId: 'org-a',
          projectId: 'project-a',
          title: '새 티켓',
          columnId: '11111111-1111-4111-8111-111111111111',
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(createTicket).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      'project-a',
      {
        title: '새 티켓',
        columnId: '11111111-1111-4111-8111-111111111111',
      },
    );
  });

  it('티켓 수정은 identity와 DTO body를 분리한다', async () => {
    await expect(
      registrar.tools()[4]!.invoke(
        {
          organizationId: 'org-a',
          projectId: 'project-a',
          ticketId: 'ticket-a',
          title: '수정된 티켓',
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(updateTicket).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      'project-a',
      'ticket-a',
      { title: '수정된 티켓' },
    );
  });

  it('티켓 이동은 identity와 ordering body를 분리한다', async () => {
    const targetColumnId = '22222222-2222-4222-8222-222222222222';

    await expect(
      registrar.tools()[5]!.invoke(
        {
          organizationId: 'org-a',
          projectId: 'project-a',
          ticketId: 'ticket-a',
          targetColumnId,
          beforeTicketId: null,
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(moveTicket).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      'project-a',
      'ticket-a',
      { targetColumnId, beforeTicketId: null },
    );
  });
});
