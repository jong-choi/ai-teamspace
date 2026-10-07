import type { ChatService } from '@/chat/chat.service';
import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { ChatMcpRegistrar } from '@/mcp/tools/chat/chat-mcp.registrar';

const auth: McpAuthContext = {
  authMethod: 'oauth',
  credentialId: null,
  userId: 'user-a',
  clientId: 'client-a',
  scopes: ['chat:read', 'chat:write'],
  allowedOrganizationIds: null,
};

const allow = async () => undefined;
const conversationId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';

const message = {
  id: messageId,
  conversationId,
  senderKind: 'user' as const,
  senderUserId: 'user-a',
  referenceKind: null,
  referenceId: null,
  content: { type: 'text' as const, text: '안녕하세요' },
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
  editedAt: null,
};

describe('Chat MCP registrar', () => {
  const listConversations = jest.fn<
    ReturnType<ChatService['listConversations']>,
    Parameters<ChatService['listConversations']>
  >();
  const listMessages = jest.fn<
    ReturnType<ChatService['listMessages']>,
    Parameters<ChatService['listMessages']>
  >();
  const sendMessage = jest.fn<
    ReturnType<ChatService['sendMessage']>,
    Parameters<ChatService['sendMessage']>
  >();

  const registrar = new ChatMcpRegistrar({
    listConversations,
    listMessages,
    sendMessage,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('대화 목록은 credential userId만 owning service에 전달한다', async () => {
    listConversations.mockResolvedValue({ items: [] });

    await registrar
      .tools()[0]!
      .invoke({ organizationId: 'org-a' }, auth, allow);

    expect(listConversations).toHaveBeenCalledWith('user-a');
  });

  it('메시지 목록은 policy tenant를 제거하고 conversation/query만 전달한다', async () => {
    listMessages.mockResolvedValue({ items: [], nextCursor: null });

    await registrar.tools()[1]!.invoke(
      {
        organizationId: 'org-a',
        conversationId,
        limit: 20,
      },
      auth,
      allow,
    );

    expect(listMessages).toHaveBeenCalledWith('user-a', conversationId, {
      limit: 20,
    });
  });

  it('메시지 전송은 policy tenant를 body에 섞지 않는다', async () => {
    sendMessage.mockResolvedValue(message);

    const output = await registrar.tools()[2]!.invoke(
      {
        organizationId: 'org-a',
        conversationId,
        text: '안녕하세요',
      },
      auth,
      allow,
    );

    expect(sendMessage).toHaveBeenCalledWith('user-a', conversationId, {
      text: '안녕하세요',
    });
    expect(output).toMatchObject({ id: messageId, content: { type: 'text' } });
  });
});
