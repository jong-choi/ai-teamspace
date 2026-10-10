import { ChatConversationListSchema } from '@/chat/dto/chat-conversation-list.dto';
import { ChatMessageSchema } from '@/chat/dto/chat-message.dto';
import { ChatMessagePageSchema } from '@/chat/dto/chat-message-page.dto';
import { QueryChatMessagesSchema } from '@/chat/dto/query-chat-messages.dto';
import { SendChatMessageSchema } from '@/chat/dto/send-chat-message.dto';
import {
  ChatMessageMutationReceiptSchema,
  mutationToolOutputSchema,
} from '@/mcp/contracts/agent-mutation-receipt.dto';
import {
  consequentialWriteAnnotations,
  defineMcpTool,
  readOnlyAnnotations,
} from '@/mcp/tools/mcp-tool-definition';

import { z } from 'zod';

const organizationIdField = {
  organizationId: z.string().trim().min(1),
};

const conversationIdentityFields = {
  ...organizationIdField,
  conversationId: z.string().trim().min(1),
};

export const chatConversationsListTool = defineMcpTool({
  name: 'chat_conversations_list',
  title: '채팅 대화 목록 조회',
  description:
    '사용자가 참여 중인 채널과 DM 목록을 조회합니다. 결과의 id가 conversationId입니다.',
  inputSchema: z.object(organizationIdField),
  outputSchema: ChatConversationListSchema,
  requiredScope: 'chat:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const chatMessagesListTool = defineMcpTool({
  name: 'chat_messages_list',
  title: '채팅 메시지 목록 조회',
  description: '대화의 최근 메시지를 조회합니다.',
  inputSchema: QueryChatMessagesSchema.extend({
    ...conversationIdentityFields,
    before: QueryChatMessagesSchema.shape.before.describe(
      '더 오래된 메시지를 이어 읽을 때만 이전 응답의 nextCursor를 넣습니다.',
    ),
  }),
  outputSchema: ChatMessagePageSchema,
  requiredScope: 'chat:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const chatMessageSendTool = defineMcpTool({
  name: 'chat_message_send',
  title: '채팅 메시지 전송',
  description:
    '사용자 이름으로 대화에 메시지를 보냅니다. 참여자에게 알림이 갑니다.',
  inputSchema: SendChatMessageSchema.extend(conversationIdentityFields),
  outputSchema: mutationToolOutputSchema(
    ChatMessageSchema,
    ChatMessageMutationReceiptSchema,
  ),
  requiredScope: 'chat:write',
  classification: 'consequential',
  annotations: consequentialWriteAnnotations,
});

export const chatToolDefinitions = [
  chatConversationsListTool,
  chatMessagesListTool,
  chatMessageSendTool,
] as const;
