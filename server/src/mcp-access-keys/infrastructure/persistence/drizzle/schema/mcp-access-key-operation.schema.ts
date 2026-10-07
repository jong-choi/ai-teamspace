import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const mcpAccessKeyOperationKindEnum = pgEnum(
  'mcp_access_key_operation_kind',
  ['create', 'rotate'],
);

export const mcpAccessKeyOperationStatusEnum = pgEnum(
  'mcp_access_key_operation_status',
  ['pending', 'completed', 'failed'],
);

export const mcpAccessKeyOperation = pgTable(
  'mcp_access_key_operation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    operation: mcpAccessKeyOperationKindEnum('operation').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    status: mcpAccessKeyOperationStatusEnum('status')
      .default('pending')
      .notNull(),
    resultingKeyId: text('resulting_key_id'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
  },
  (table) => [
    unique('mcp_access_key_operation_user_idempotency_unique').on(
      table.userId,
      table.idempotencyKey,
    ),
    index('mcp_access_key_operation_user_status_idx').on(
      table.userId,
      table.status,
    ),
    index('mcp_access_key_operation_expires_at_idx').on(table.expiresAt),
  ],
);
