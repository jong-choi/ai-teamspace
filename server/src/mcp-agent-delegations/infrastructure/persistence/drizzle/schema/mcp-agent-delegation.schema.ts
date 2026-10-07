import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const mcpAgentDelegation = pgTable(
  'mcp_agent_delegation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    issuer: text('issuer').notNull(),
    resourceUrl: text('resource_url').notNull(),
    oauthClientIdentity: text('oauth_client_identity').notNull(),
    grantedScopes: text('granted_scopes').array().notNull(),
    tokensFormatVersion: integer('tokens_format_version').notNull(),
    tokensAlgorithm: text('tokens_algorithm').notNull(),
    tokensKeyId: text('tokens_key_id').notNull(),
    tokensNonce: text('tokens_nonce').notNull(),
    tokensCiphertext: text('tokens_ciphertext').notNull(),
    tokensAuthTag: text('tokens_auth_tag').notNull(),
    revision: integer('revision').default(0).notNull(),
    refreshLeaseOwner: text('refresh_lease_owner'),
    refreshLeaseExpiresAt: timestamp('refresh_lease_expires_at', {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique('mcp_agent_delegation_actor_issuer_client_unique').on(
      table.userId,
      table.organizationId,
      table.issuer,
      table.oauthClientIdentity,
    ),
    index('mcp_agent_delegation_actor_active_idx').on(
      table.userId,
      table.organizationId,
      table.revokedAt,
    ),
    check(
      'mcp_agent_delegation_tokens_format_version_positive_check',
      sql`${table.tokensFormatVersion} > 0`,
    ),
    check(
      'mcp_agent_delegation_revision_nonnegative_check',
      sql`${table.revision} >= 0`,
    ),
    check(
      'mcp_agent_delegation_refresh_lease_complete_check',
      sql`(
        ${table.refreshLeaseOwner} IS NULL
        AND ${table.refreshLeaseExpiresAt} IS NULL
      ) OR (
        ${table.refreshLeaseOwner} IS NOT NULL
        AND ${table.refreshLeaseExpiresAt} IS NOT NULL
      )`,
    ),
  ],
);
