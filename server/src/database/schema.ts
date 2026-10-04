import * as authSchema from '#server/auth/infrastructure/persistence/drizzle/generated/auth.schema.js';
import * as chatConversationSchema from '#server/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema.js';
import * as chatMessageSchema from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.schema.js';
import * as chatParticipantSchema from '#server/chat/infrastructure/persistence/drizzle/schema/chat-participant.schema.js';

export const databaseSchema = {
  ...authSchema,
  ...chatConversationSchema,
  ...chatMessageSchema,
  ...chatParticipantSchema,
};
