import {
  ChatParticipantUserIdSchema,
  ChatParticipantUsernameSchema,
} from '@/chat/dto/create-chat-channel.dto';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

// 수신자는 정확한 username 또는 활성 조직 멤버의 user ID 중 하나로만 지정한다.
export const CreateChatDirectSchema = z
  .object({
    recipientUsername: ChatParticipantUsernameSchema.optional(),
    recipientUserId: ChatParticipantUserIdSchema.optional(),
  })
  .refine(
    (input) =>
      (input.recipientUsername === undefined) !==
      (input.recipientUserId === undefined),
    {
      message: 'recipientUsername과 recipientUserId 중 하나만 지정해야 합니다.',
    },
  );

export type CreateChatDirectInput = z.infer<typeof CreateChatDirectSchema>;

export class CreateChatDirectDto extends createZodDto(CreateChatDirectSchema) {}
