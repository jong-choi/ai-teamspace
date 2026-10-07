import { projectToolDefinitions } from '@/mcp/tools/projects/project-tool-definitions';

describe('Projects MCP tool 정의', () => {
  it('v1 Projects tool 여섯 개를 고정한다', () => {
    expect(
      projectToolDefinitions.map(({ name, requiredScope }) => ({
        name,
        requiredScope,
      })),
    ).toEqual([
      { name: 'projects_list', requiredScope: 'projects:read' },
      { name: 'project_get', requiredScope: 'projects:read' },
      { name: 'project_ticket_get', requiredScope: 'projects:read' },
      { name: 'project_ticket_create', requiredScope: 'projects:write' },
      { name: 'project_ticket_update', requiredScope: 'projects:write' },
      { name: 'project_ticket_move', requiredScope: 'projects:write' },
    ]);
  });

  it('티켓 update는 기존 최소 한 필드 수정 규칙을 유지한다', () => {
    const definition = projectToolDefinitions[4];
    const identity = {
      organizationId: 'org-a',
      projectId: 'project-a',
      ticketId: 'ticket-a',
    };

    expect(() => definition.inputSchema.parse(identity)).toThrow();
    expect(
      definition.inputSchema.parse({
        ...identity,
        title: '수정된 티켓',
      }),
    ).toMatchObject({ ...identity, title: '수정된 티켓' });
  });

  it('티켓 move는 before/after 동시 지정을 거부한다', () => {
    const definition = projectToolDefinitions[5];

    expect(() =>
      definition.inputSchema.parse({
        organizationId: 'org-a',
        projectId: 'project-a',
        ticketId: 'ticket-a',
        targetColumnId: '11111111-1111-4111-8111-111111111111',
        beforeTicketId: '22222222-2222-4222-8222-222222222222',
        afterTicketId: '33333333-3333-4333-8333-333333333333',
      }),
    ).toThrow();
  });

  it('티켓 move는 consequential write다', () => {
    expect(projectToolDefinitions[5]).toMatchObject({
      classification: 'consequential',
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    });
  });
});
