import { ChatParticipantUsernameSchema } from '@/chat/dto/create-chat-channel.dto';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const CreateChatDirectSchema = z.object({
  recipientUsername: ChatParticipantUsernameSchema,
});

export type CreateChatDirectInput = z.infer<typeof CreateChatDirectSchema>;

export class CreateChatDirectDto extends createZodDto(CreateChatDirectSchema) {}
