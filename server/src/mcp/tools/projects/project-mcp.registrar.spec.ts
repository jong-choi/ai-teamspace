import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { ProjectMcpRegistrar } from '@/mcp/tools/projects/project-mcp.registrar';
import type { ProjectColumnsService } from '@/projects/project-columns.service';
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
const projectId = '44444444-4444-4444-8444-444444444444';
const ticketId = '55555555-5555-4555-8555-555555555555';

describe('Projects MCP registrar', () => {
  const listProjects = jest.fn<
    ReturnType<ProjectsService['listProjects']>,
    Parameters<ProjectsService['listProjects']>
  >();
  const getProject = jest.fn<
    ReturnType<ProjectsService['getProject']>,
    Parameters<ProjectsService['getProject']>
  >();
  const listColumns = jest.fn<
    ReturnType<ProjectColumnsService['listColumns']>,
    Parameters<ProjectColumnsService['listColumns']>
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
  const listTickets = jest.fn<
    ReturnType<TicketsService['listTickets']>,
    Parameters<TicketsService['listTickets']>
  >();
  const moveTicket = jest.fn<
    ReturnType<TicketOrderingService['moveTicket']>,
    Parameters<TicketOrderingService['moveTicket']>
  >();

  const registrar = new ProjectMcpRegistrar(
    { listProjects, getProject },
    { listColumns },
    { listTickets, getTicket, createTicket, updateTicket },
    { moveTicket },
  );

  function tool(name: string) {
    const found = registrar
      .tools()
      .find(({ definition }) => definition.name === name);
    if (!found) throw new Error(`${name} tool이 등록되지 않았습니다.`);
    return found;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    for (const mock of [
      listProjects,
      getProject,
      listColumns,
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
      tool('projects_list').invoke({ organizationId: 'org-a' }, auth, allow),
    ).rejects.toBe(stop);

    expect(listProjects).toHaveBeenCalledWith({ userId: 'user-a' }, 'org-a');
  });

  it('프로젝트 조회는 project identity를 분리해 전달한다', async () => {
    await expect(
      tool('project_get').invoke(
        { organizationId: 'org-a', projectId },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(getProject).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      projectId,
    );
  });

  it('컬럼 목록은 project identity를 분리해 전달한다', async () => {
    await expect(
      tool('project_columns_list').invoke(
        { organizationId: 'org-a', projectId },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(listColumns).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      projectId,
    );
  });

  it('UUID가 아닌 project/ticket id는 service 호출 전에 거부한다', async () => {
    await expect(
      tool('project_ticket_get').invoke(
        { organizationId: 'org-a', projectId, ticketId: 'some' },
        auth,
        allow,
      ),
    ).rejects.not.toBe(stop);

    expect(getTicket).not.toHaveBeenCalled();
  });

  it('티켓 목록은 project identity와 검색 조건을 나눠 전달한다', async () => {
    listTickets.mockResolvedValue({ items: [] });

    await tool('project_tickets_list').invoke(
      { organizationId: 'org-a', projectId, search: '버벅임' },
      auth,
      allow,
    );

    expect(listTickets).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' }),
      'org-a',
      projectId,
      { search: '버벅임' },
    );
  });

  it('티켓 조회는 organization/project/ticket identity를 전달한다', async () => {
    await expect(
      tool('project_ticket_get').invoke(
        {
          organizationId: 'org-a',
          projectId,
          ticketId,
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(getTicket).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      projectId,
      ticketId,
    );
  });

  it('티켓 생성은 identity와 DTO body를 분리한다', async () => {
    await expect(
      tool('project_ticket_create').invoke(
        {
          organizationId: 'org-a',
          projectId,
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
      projectId,
      {
        title: '새 티켓',
        columnId: '11111111-1111-4111-8111-111111111111',
      },
    );
  });

  it('티켓 수정은 identity와 DTO body를 분리한다', async () => {
    await expect(
      tool('project_ticket_update').invoke(
        {
          organizationId: 'org-a',
          projectId,
          ticketId,
          title: '수정된 티켓',
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(updateTicket).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      projectId,
      ticketId,
      { title: '수정된 티켓' },
    );
  });

  it('티켓 이동은 identity와 ordering body를 분리한다', async () => {
    const targetColumnId = '22222222-2222-4222-8222-222222222222';

    await expect(
      tool('project_ticket_move').invoke(
        {
          organizationId: 'org-a',
          projectId,
          ticketId,
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
      projectId,
      ticketId,
      { targetColumnId, beforeTicketId: null },
    );
  });
});
