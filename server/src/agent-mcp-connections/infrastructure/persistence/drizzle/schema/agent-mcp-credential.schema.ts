import { agentMcpConnection } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.schema';

import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const agentMcpCredential = pgTable(
  'agent_mcp_credential',
  {
    connectionId: uuid('connection_id')
      .primaryKey()
      .references(() => agentMcpConnection.id, { onDelete: 'cascade' }),
    formatVersion: integer('format_version').default(1).notNull(),
    algorithm: text('algorithm').notNull(),
    keyId: text('key_id').notNull(),
    nonce: text('nonce').notNull(),
    ciphertext: text('ciphertext').notNull(),
    authTag: text('auth_tag').notNull(),
    revision: integer('revision').default(0).notNull(),
    refreshLeaseId: text('refresh_lease_id'),
    refreshLeaseExpiresAt: timestamp('refresh_lease_expires_at', {
      withTimezone: true,
      precision: 3,
    }),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      precision: 3,
    }),
    refreshedAt: timestamp('refreshed_at', {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'agent_mcp_credential_format_version_positive_check',
      sql`${table.formatVersion} > 0`,
    ),
    check(
      'agent_mcp_credential_revision_nonnegative_check',
      sql`${table.revision} >= 0`,
    ),
    check(
      'agent_mcp_credential_refresh_lease_complete_check',
      sql`(
        ${table.refreshLeaseId} IS NULL
        AND ${table.refreshLeaseExpiresAt} IS NULL
      ) OR (
        ${table.refreshLeaseId} IS NOT NULL
        AND ${table.refreshLeaseExpiresAt} IS NOT NULL
      )`,
    ),
  ],
);
