import { Inject, Injectable } from '@nestjs/common';

import { ChatService } from '@/chat/chat.service';
import { bindMcpTool, type BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import {
  chatConversationsListTool,
  chatMessageSendTool,
  chatMessagesListTool,
} from '@/mcp/tools/chat/chat-tool-definitions';

type ChatToolsService = Pick<
  ChatService,
  'listConversations' | 'listMessages' | 'sendMessage'
>;

@Injectable()
export class ChatMcpRegistrar {
  constructor(
    @Inject(ChatService)
    private readonly chatService: ChatToolsService,
  ) {}

  tools(): BoundMcpTool[] {
    return [
      bindMcpTool(chatConversationsListTool, async (_input, auth) =>
        this.chatService.listConversations(auth.userId),
      ),
      bindMcpTool(chatMessagesListTool, async (input, auth) => {
        const {
          organizationId: _organizationId,
          conversationId,
          ...query
        } = input;
        return this.chatService.listMessages(
          auth.userId,
          conversationId,
          query,
        );
      }),
      bindMcpTool(chatMessageSendTool, async (input, auth) => {
        const {
          organizationId: _organizationId,
          conversationId,
          ...body
        } = input;
        return this.chatService.sendMessage(auth.userId, conversationId, body);
      }),
    ];
  }
}
