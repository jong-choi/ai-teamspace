import { SendChatMessageSchema } from '#server/chat/dto/send-chat-message.dto.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const UpdateChatMessageSchema = SendChatMessageSchema;

export type UpdateChatMessageInput = z.infer<typeof UpdateChatMessageSchema>;

export class UpdateChatMessageDto extends createZodDto(
  UpdateChatMessageSchema,
) {}
