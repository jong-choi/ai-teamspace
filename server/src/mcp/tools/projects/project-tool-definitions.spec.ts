import {
  projectTicketMoveTool,
  projectTicketUpdateTool,
} from '@/mcp/tools/projects/project-tool-definitions';

describe('Projects MCP tool 정의', () => {
  it('티켓 update는 기존 최소 한 필드 수정 규칙을 유지한다', () => {
    const definition = projectTicketUpdateTool;
    const identity = {
      organizationId: 'org-a',
      projectId: '44444444-4444-4444-8444-444444444444',
      ticketId: '55555555-5555-4555-8555-555555555555',
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
    const definition = projectTicketMoveTool;

    expect(() =>
      definition.inputSchema.parse({
        organizationId: 'org-a',
        projectId: '44444444-4444-4444-8444-444444444444',
        ticketId: '55555555-5555-4555-8555-555555555555',
        targetColumnId: '11111111-1111-4111-8111-111111111111',
        beforeTicketId: '22222222-2222-4222-8222-222222222222',
        afterTicketId: '33333333-3333-4333-8333-333333333333',
      }),
    ).toThrow();
  });

  it('티켓 move는 consequential write다', () => {
    expect(projectTicketMoveTool).toMatchObject({
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
