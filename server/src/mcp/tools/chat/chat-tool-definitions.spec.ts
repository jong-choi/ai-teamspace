import { chatToolDefinitions } from '@/mcp/tools/chat/chat-tool-definitions';

describe('Chat MCP tool 정의', () => {
  it('v1 Chat tool 세 개를 고정한다', () => {
    expect(
      chatToolDefinitions.map(({ name, requiredScope }) => ({
        name,
        requiredScope,
      })),
    ).toEqual([
      { name: 'chat_conversations_list', requiredScope: 'chat:read' },
      { name: 'chat_messages_list', requiredScope: 'chat:read' },
      { name: 'chat_message_send', requiredScope: 'chat:write' },
    ]);
  });

  it('메시지 목록은 기존 page size 상한을 재사용한다', () => {
    const definition = chatToolDefinitions[1];

    expect(
      definition.inputSchema.parse({
        organizationId: 'org-a',
        conversationId: 'conversation-a',
        limit: 100,
      }),
    ).toMatchObject({
      organizationId: 'org-a',
      conversationId: 'conversation-a',
      limit: 100,
    });

    expect(() =>
      definition.inputSchema.parse({
        organizationId: 'org-a',
        conversationId: 'conversation-a',
        limit: 101,
      }),
    ).toThrow();
  });

  it('메시지 전송은 consequential write다', () => {
    const definition = chatToolDefinitions[2];

    expect(definition.classification).toBe('consequential');
    expect(definition.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });
});
