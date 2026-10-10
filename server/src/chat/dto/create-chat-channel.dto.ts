import {
  chatChannelNameSchema,
  chatChannelTopicSchema,
  chatConversationInsertSchema,
} from '@/chat/infrastructure/persistence/drizzle/schema/chat-conversation.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const ChatParticipantUsernameSchema = z.string().trim().min(1).max(255);
export const ChatParticipantUserIdSchema = z.string().min(1).max(255);

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
    // 활성 조직 멤버를 검색해 고른 참여자다. 조직 밖 사용자는 username으로만 지정한다.
    participantUserIds: z.array(ChatParticipantUserIdSchema).max(49).optional(),
  });

export type CreateChatChannelInput = z.infer<typeof CreateChatChannelSchema>;

export class CreateChatChannelDto extends createZodDto(
  CreateChatChannelSchema,
) {}
