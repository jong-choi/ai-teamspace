import { chatTextMessageContentSchema } from '@/chat/domain/chat-message-content';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const SendChatMessageSchema = chatTextMessageContentSchema;

export type SendChatMessageInput = z.infer<typeof SendChatMessageSchema>;

export class SendChatMessageDto extends createZodDto(SendChatMessageSchema) {}
