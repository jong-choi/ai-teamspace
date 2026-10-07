import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const mcpOrganizationPolicy = pgTable(
  'mcp_organization_policy',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    allowedScopes: text('allowed_scopes').array().notNull(),
    revision: integer('revision').default(0).notNull(),
    updatedByUserId: text('updated_by_user_id').references(
      () => authUserIdColumn,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'mcp_organization_policy_revision_nonnegative_check',
      sql`${table.revision} >= 0`,
    ),
  ],
);
