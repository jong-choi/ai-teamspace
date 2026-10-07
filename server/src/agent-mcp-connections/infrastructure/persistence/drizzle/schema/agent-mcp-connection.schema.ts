import { AGENT_MCP_ERROR_CATEGORIES } from '@/agent-mcp-connections/domain/agent-mcp-connection-health';
import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import { sql } from 'drizzle-orm';
import {
  boolean,
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

export const agentMcpTransportEnum = pgEnum('agent_mcp_transport', ['http']);

export const agentMcpAuthKindEnum = pgEnum('agent_mcp_auth_kind', [
  'none',
  'bearer',
  'oauth',
]);

export const agentMcpToolPolicyModeEnum = pgEnum('agent_mcp_tool_policy_mode', [
  'selected',
  'all',
]);

export const agentMcpLastErrorCategoryEnum = pgEnum(
  'agent_mcp_last_error_category',
  AGENT_MCP_ERROR_CATEGORIES,
);

export const agentMcpConnection = pgTable(
  'agent_mcp_connection',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    namespace: text('namespace').notNull(),
    endpoint: text('endpoint').notNull(),
    transport: agentMcpTransportEnum('transport').default('http').notNull(),
    authKind: agentMcpAuthKindEnum('auth_kind').notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    toolPolicyMode: agentMcpToolPolicyModeEnum('tool_policy_mode')
      .default('selected')
      .notNull(),
    revision: integer('revision').default(0).notNull(),
    lastTestedAt: timestamp('last_tested_at', {
      withTimezone: true,
      precision: 3,
    }),
    lastErrorCategory: agentMcpLastErrorCategoryEnum('last_error_category'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('agent_mcp_connection_owner_org_namespace_unique').on(
      table.ownerUserId,
      table.organizationId,
      table.namespace,
    ),
    index('agent_mcp_connection_owner_org_enabled_idx').on(
      table.ownerUserId,
      table.organizationId,
      table.enabled,
    ),
    check(
      'agent_mcp_connection_revision_nonnegative_check',
      sql`${table.revision} >= 0`,
    ),
  ],
);
