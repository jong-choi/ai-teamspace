import { chatMessageSelectSchema } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const MarkChatReadSchema = z.object({
  messageId: chatMessageSelectSchema.shape.id,
});

export type MarkChatReadInput = z.infer<typeof MarkChatReadSchema>;

export class MarkChatReadDto extends createZodDto(MarkChatReadSchema) {}
