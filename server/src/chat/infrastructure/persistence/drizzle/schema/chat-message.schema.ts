import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';
import { chatConversation } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema.js';

import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const chatMessageSenderKindEnum = pgEnum('chat_message_sender_kind', [
  'system',
  'user',
]);

export const chatMessageContentTypeEnum = pgEnum('chat_message_content_type', [
  'text',
]);

export const chatMessage = pgTable(
  'chat_message',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversation.id, { onDelete: 'cascade' }),
    senderKind: chatMessageSenderKindEnum('sender_kind').notNull(),
    senderUserId: text('sender_user_id').references(() => authUserIdColumn, {
      onDelete: 'set null',
    }),
    contentType: chatMessageContentTypeEnum('content_type').notNull(),
    content: jsonb('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (table) => [
    index('chat_message_conversation_created_id_idx').on(
      table.conversationId,
      table.createdAt,
      table.id,
    ),
    index('chat_message_sender_user_idx').on(table.senderUserId),
  ],
);
