import {
  chatChannelNameSchema,
  chatChannelTopicSchema,
  chatConversationInsertSchema,
} from '#server/chat/infrastructure/persistence/drizzle/schema/chat-conversation.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const ChatParticipantUsernameSchema = z.string().trim().min(1).max(255);

export const CreateChatChannelSchema = chatConversationInsertSchema
  .pick({
    name: true,
    topic: true,
  })
  .extend({
    name: chatChannelNameSchema,
    topic: chatChannelTopicSchema.nullable().optional(),
    participantUsernames: z
      .array(ChatParticipantUsernameSchema)
      .max(49)
      .optional(),
  });

export type CreateChatChannelInput = z.infer<typeof CreateChatChannelSchema>;

export class CreateChatChannelDto extends createZodDto(
  CreateChatChannelSchema,
) {}
