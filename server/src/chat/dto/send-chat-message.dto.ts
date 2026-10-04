import { chatTextMessageContentSchema } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const SendChatMessageSchema = chatTextMessageContentSchema;

export type SendChatMessageInput = z.infer<typeof SendChatMessageSchema>;

export class SendChatMessageDto extends createZodDto(SendChatMessageSchema) {}
