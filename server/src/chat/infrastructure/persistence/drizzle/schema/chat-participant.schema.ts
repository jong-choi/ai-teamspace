import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';
import { chatConversation } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema.js';

import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const chatParticipant = pgTable(
  'chat_participant',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversation.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('chat_participant_user_conversation_idx').on(
      table.userId,
      table.conversationId,
    ),
  ],
);
