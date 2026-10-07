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

export const mcpAgentOauthFlow = pgTable(
  'mcp_agent_oauth_flow',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    oauthClientIdentity: text('oauth_client_identity').notNull(),
    issuer: text('issuer'),
    stateHash: text('state_hash').notNull(),
    requestedScopes: text('requested_scopes').array().notNull(),
    resourceUrl: text('resource_url').notNull(),
    redirectUrl: text('redirect_url').notNull(),
    returnTo: text('return_to').notNull(),
    completionUrl: text('completion_url').notNull(),
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
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('mcp_agent_oauth_flow_state_hash_unique').on(table.stateHash),
    index('mcp_agent_oauth_flow_actor_expiry_idx').on(
      table.userId,
      table.organizationId,
      table.expiresAt,
    ),
    check(
      'mcp_agent_oauth_flow_state_hash_sha256_check',
      sql`char_length(${table.stateHash}) = 64`,
    ),
    check(
      'mcp_agent_oauth_flow_expiry_after_creation_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'mcp_agent_oauth_flow_verifier_envelope_complete_check',
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
      'mcp_agent_oauth_flow_discovery_envelope_complete_check',
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
  ],
);
