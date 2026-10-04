import { ChatParticipantUsernameSchema } from '#server/chat/dto/create-chat-channel.dto.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const CreateChatDirectSchema = z.object({
  recipientUsername: ChatParticipantUsernameSchema,
});

export type CreateChatDirectInput = z.infer<typeof CreateChatDirectSchema>;

export class CreateChatDirectDto extends createZodDto(CreateChatDirectSchema) {}
