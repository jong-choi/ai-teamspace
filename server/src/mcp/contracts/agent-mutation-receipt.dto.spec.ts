import { AgentMutationReceiptSchema } from '@/mcp/contracts/agent-mutation-receipt.dto';
import { v1McpToolDefinitions } from '@/mcp/tools/v1-tool-manifest';

const WRITE_TOOL_NAMES = [
  'organization_invitation_create',
  'chat_message_send',
  'wiki_document_create',
  'wiki_document_update',
  'calendar_meeting_create',
  'calendar_meeting_reschedule',
  'calendar_meeting_cancel',
  'calendar_meeting_rsvp',
  'project_ticket_create',
  'project_ticket_update',
  'project_ticket_move',
];

describe('Agent 변경 영수증 계약', () => {
  it('모든 write tool output에 result와 mutation이 있고 read tool에는 없다', () => {
    for (const definition of v1McpToolDefinitions) {
      const keys = Object.keys(definition.outputSchema.shape);
      if (WRITE_TOOL_NAMES.includes(definition.name)) {
        expect(keys.sort()).toEqual(['mutation', 'result']);
      } else {
        expect(keys).not.toContain('mutation');
      }
    }
    expect(
      v1McpToolDefinitions.filter((tool) =>
        WRITE_TOOL_NAMES.includes(tool.name),
      ),
    ).toHaveLength(WRITE_TOOL_NAMES.length);
  });

  it('kind와 맞지 않는 operation 조합을 거부한다', () => {
    const base = {
      version: 1,
      source: 'workos',
      organizationId: 'org-a',
      resourceId: 'doc-a',
      revision: 2,
      updatedAt: '2026-10-08T00:00:00.000Z',
    };

    expect(
      AgentMutationReceiptSchema.safeParse({
        ...base,
        kind: 'wiki_document',
        operation: 'updated',
      }).success,
    ).toBe(true);
    expect(
      AgentMutationReceiptSchema.safeParse({
        ...base,
        kind: 'wiki_document',
        operation: 'responded',
      }).success,
    ).toBe(false);
  });

  it('알 수 없는 version과 외부 source를 거부한다', () => {
    const receipt = {
      version: 1,
      source: 'workos',
      kind: 'organization_invitation',
      operation: 'created',
      organizationId: 'org-a',
      resourceId: 'invitation-a',
    };

    expect(AgentMutationReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(
      AgentMutationReceiptSchema.safeParse({ ...receipt, version: 2 }).success,
    ).toBe(false);
    expect(
      AgentMutationReceiptSchema.safeParse({ ...receipt, source: 'external' })
        .success,
    ).toBe(false);
  });
});
