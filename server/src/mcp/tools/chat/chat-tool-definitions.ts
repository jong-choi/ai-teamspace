import { ChatConversationListSchema } from '@/chat/dto/chat-conversation-list.dto';
import { ChatMessageSchema } from '@/chat/dto/chat-message.dto';
import { ChatMessagePageSchema } from '@/chat/dto/chat-message-page.dto';
import { QueryChatMessagesSchema } from '@/chat/dto/query-chat-messages.dto';
import { SendChatMessageSchema } from '@/chat/dto/send-chat-message.dto';
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
    '현재 인증된 사용자가 참여 중인 채팅 대화 목록을 조회합니다. organizationId는 조직별 MCP 정책 admission에 사용하며 사용자 identity는 credential에서 결정되어 다른 userId를 지정할 수 없습니다.',
  inputSchema: z.object(organizationIdField),
  outputSchema: ChatConversationListSchema,
  requiredScope: 'chat:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const chatMessagesListTool = defineMcpTool({
  name: 'chat_messages_list',
  title: '채팅 메시지 목록 조회',
  description:
    '현재 사용자가 참여 중인 대화의 메시지를 bounded page로 조회합니다. organizationId의 MCP 정책 admission과 해당 대화의 현재 participant 권한을 모두 통과해야 합니다.',
  inputSchema: QueryChatMessagesSchema.extend(conversationIdentityFields),
  outputSchema: ChatMessagePageSchema,
  requiredScope: 'chat:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const chatMessageSendTool = defineMcpTool({
  name: 'chat_message_send',
  title: '채팅 메시지 전송',
  description:
    '현재 사용자의 이름으로 기존 대화에 텍스트 메시지를 전송하고 실시간 알림을 발생시킵니다. organizationId의 MCP 정책 admission과 현재 대화 참여 권한이 모두 필요합니다.',
  inputSchema: SendChatMessageSchema.extend(conversationIdentityFields),
  outputSchema: ChatMessageSchema,
  requiredScope: 'chat:write',
  classification: 'consequential',
  annotations: consequentialWriteAnnotations,
});

export const chatToolDefinitions = [
  chatConversationsListTool,
  chatMessagesListTool,
  chatMessageSendTool,
] as const;
