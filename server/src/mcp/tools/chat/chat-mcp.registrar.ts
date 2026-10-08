import { Inject, Injectable } from '@nestjs/common';

import { ChatService } from '@/chat/chat.service';
import { bindMcpTool, type BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import {
  chatConversationsListTool,
  chatMessageSendTool,
  chatMessagesListTool,
} from '@/mcp/tools/chat/chat-tool-definitions';
import { chatMessageReceipt } from '@/mcp/tools/mcp-mutation-receipt.mapper';

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
        const { organizationId, conversationId, ...query } = input;
        void organizationId;
        return this.chatService.listMessages(
          auth.userId,
          conversationId,
          query,
        );
      }),
      bindMcpTool(chatMessageSendTool, async (input, auth) => {
        const { organizationId, conversationId, ...body } = input;
        const result = await this.chatService.sendMessage(
          auth.userId,
          conversationId,
          body,
        );
        return { result, mutation: chatMessageReceipt(organizationId, result) };
      }),
    ];
  }
}
