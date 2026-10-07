import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const mcpAccessKeyAllocationStateEnum = pgEnum(
  'mcp_access_key_allocation_state',
  ['reserving', 'active'],
);

export const mcpAccessKeyAllocation = pgTable(
  'mcp_access_key_allocation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'cascade' }),
    slot: integer('slot').notNull(),
    betterAuthKeyId: text('better_auth_key_id'),
    state: mcpAccessKeyAllocationStateEnum('state')
      .default('reserving')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('mcp_access_key_allocation_user_slot_unique').on(
      table.userId,
      table.slot,
    ),
    unique('mcp_access_key_allocation_better_auth_key_unique').on(
      table.betterAuthKeyId,
    ),
    index('mcp_access_key_allocation_user_state_idx').on(
      table.userId,
      table.state,
    ),
    check(
      'mcp_access_key_allocation_slot_nonnegative_check',
      sql`${table.slot} >= 0`,
    ),
  ],
);
