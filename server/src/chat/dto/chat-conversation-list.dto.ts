import { ChatConversationSchema } from '@/chat/dto/chat-conversation.dto';
import { createZodDto } from '@/common/dto/create-zod-dto';

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
