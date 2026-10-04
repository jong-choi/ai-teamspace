import { ChatMessageSchema } from '#server/chat/dto/chat-message.dto.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const ChatMessagePageSchema = z
  .object({
    items: z.array(ChatMessageSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'ChatMessagePage' });

export type ChatMessagePageResponse = z.infer<typeof ChatMessagePageSchema>;

export class ChatMessagePageDto extends createZodDto(ChatMessagePageSchema) {}
