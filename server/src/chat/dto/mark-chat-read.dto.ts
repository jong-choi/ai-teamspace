import { chatMessageSelectSchema } from '@/chat/infrastructure/persistence/drizzle/schema/chat-message.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const MarkChatReadSchema = z.object({
  messageId: chatMessageSelectSchema.shape.id,
});

export type MarkChatReadInput = z.infer<typeof MarkChatReadSchema>;

export class MarkChatReadDto extends createZodDto(MarkChatReadSchema) {}
