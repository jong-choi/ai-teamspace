import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const mcpUserPolicy = pgTable(
  'mcp_user_policy',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'cascade' }),
    requestedScopes: text('requested_scopes').array().notNull(),
    revision: integer('revision').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    check(
      'mcp_user_policy_revision_nonnegative_check',
      sql`${table.revision} >= 0`,
    ),
    index('mcp_user_policy_user_organization_idx').on(
      table.userId,
      table.organizationId,
    ),
  ],
);
