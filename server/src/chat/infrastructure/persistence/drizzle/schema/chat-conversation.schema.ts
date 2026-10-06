import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const chatConversationKindEnum = pgEnum('chat_conversation_kind', [
  'channel',
  'direct',
  'system',
]);

export const chatConversation = pgTable(
  'chat_conversation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: chatConversationKindEnum('kind').notNull(),
    name: text('name'),
    topic: text('topic'),
    directKey: text('direct_key'),
    systemUserId: text('system_user_id').references(() => authUserIdColumn, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('chat_conversation_direct_key_uidx').on(table.directKey),
    uniqueIndex('chat_conversation_system_user_uidx').on(table.systemUserId),
    index('chat_conversation_updated_at_idx').on(table.updatedAt),
  ],
);
