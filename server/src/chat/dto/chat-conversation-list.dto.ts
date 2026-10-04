import { ChatConversationSchema } from '#server/chat/dto/chat-conversation.dto.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const ChatConversationListSchema = z
  .object({
    items: z.array(ChatConversationSchema),
  })
  .meta({ id: 'ChatConversationList' });

export type ChatConversationListResponse = z.infer<
  typeof ChatConversationListSchema
>;

export class ChatConversationListDto extends createZodDto(
  ChatConversationListSchema,
) {}
