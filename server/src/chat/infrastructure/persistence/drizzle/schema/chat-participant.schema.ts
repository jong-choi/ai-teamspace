import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';
import { chatConversation } from '@/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema';

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
    joinedAt: timestamp('joined_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('chat_participant_user_conversation_idx').on(
      table.userId,
      table.conversationId,
    ),
  ],
);
