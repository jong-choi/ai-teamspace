import { agentMcpConnection } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.schema';
import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const agentMcpOauthState = pgTable(
  'agent_mcp_oauth_state',
  {
    stateHash: text('state_hash').primaryKey(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => agentMcpConnection.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    resourceIdentity: text('resource_identity').notNull(),
    authorizationServer: text('authorization_server'),
    redirectUri: text('redirect_uri').notNull(),
    verifierFormatVersion: integer('verifier_format_version'),
    verifierAlgorithm: text('verifier_algorithm'),
    verifierKeyId: text('verifier_key_id'),
    verifierNonce: text('verifier_nonce'),
    verifierCiphertext: text('verifier_ciphertext'),
    verifierAuthTag: text('verifier_auth_tag'),
    discoveryFormatVersion: integer('discovery_format_version'),
    discoveryAlgorithm: text('discovery_algorithm'),
    discoveryKeyId: text('discovery_key_id'),
    discoveryNonce: text('discovery_nonce'),
    discoveryCiphertext: text('discovery_ciphertext'),
    discoveryAuthTag: text('discovery_auth_tag'),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    consumedAt: timestamp('consumed_at', {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'agent_mcp_oauth_state_verifier_envelope_complete_check',
      sql`(
        ${table.verifierFormatVersion} IS NULL
        AND ${table.verifierAlgorithm} IS NULL
        AND ${table.verifierKeyId} IS NULL
        AND ${table.verifierNonce} IS NULL
        AND ${table.verifierCiphertext} IS NULL
        AND ${table.verifierAuthTag} IS NULL
      ) OR (
        ${table.verifierFormatVersion} IS NOT NULL
        AND ${table.verifierAlgorithm} IS NOT NULL
        AND ${table.verifierKeyId} IS NOT NULL
        AND ${table.verifierNonce} IS NOT NULL
        AND ${table.verifierCiphertext} IS NOT NULL
        AND ${table.verifierAuthTag} IS NOT NULL
      )`,
    ),
    check(
      'agent_mcp_oauth_state_verifier_format_version_positive_check',
      sql`${table.verifierFormatVersion} IS NULL OR ${table.verifierFormatVersion} > 0`,
    ),
    check(
      'agent_mcp_oauth_state_discovery_envelope_complete_check',
      sql`(
        ${table.discoveryFormatVersion} IS NULL
        AND ${table.discoveryAlgorithm} IS NULL
        AND ${table.discoveryKeyId} IS NULL
        AND ${table.discoveryNonce} IS NULL
        AND ${table.discoveryCiphertext} IS NULL
        AND ${table.discoveryAuthTag} IS NULL
      ) OR (
        ${table.discoveryFormatVersion} IS NOT NULL
        AND ${table.discoveryAlgorithm} IS NOT NULL
        AND ${table.discoveryKeyId} IS NOT NULL
        AND ${table.discoveryNonce} IS NOT NULL
        AND ${table.discoveryCiphertext} IS NOT NULL
        AND ${table.discoveryAuthTag} IS NOT NULL
      )`,
    ),
    check(
      'agent_mcp_oauth_state_discovery_format_version_positive_check',
      sql`${table.discoveryFormatVersion} IS NULL OR ${table.discoveryFormatVersion} > 0`,
    ),
    check(
      'agent_mcp_oauth_state_expiry_after_creation_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);
