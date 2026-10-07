import { agentMcpConnection } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.schema';

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const agentMcpConnectionTool = pgTable(
  'agent_mcp_connection_tools',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => agentMcpConnection.id, { onDelete: 'cascade' }),
    originalToolName: text('original_tool_name').notNull(),
    schemaFingerprint: text('schema_fingerprint'),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('agent_mcp_connection_tool_identity_unique').on(
      table.connectionId,
      table.originalToolName,
    ),
    index('agent_mcp_connection_tool_enabled_idx').on(
      table.connectionId,
      table.enabled,
    ),
  ],
);
