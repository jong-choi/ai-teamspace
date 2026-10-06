import { SendChatMessageSchema } from '@/chat/dto/send-chat-message.dto';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const UpdateChatMessageSchema = SendChatMessageSchema;

export type UpdateChatMessageInput = z.infer<typeof UpdateChatMessageSchema>;

export class UpdateChatMessageDto extends createZodDto(
  UpdateChatMessageSchema,
) {}
