import { AgentMcpLastErrorCategorySchema } from '@/agent-mcp-connections/domain/agent-mcp-connection-health';
import { AgentMcpEndpointSchema } from '@/agent-mcp-connections/domain/agent-mcp-endpoint';
import { AgentMcpNamespaceSchema } from '@/agent-mcp-connections/domain/agent-mcp-tool-identity';
import { agentMcpConnection } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const fieldRefinements = {
  displayName: z.string().trim().min(1).max(100),
  namespace: AgentMcpNamespaceSchema,
  endpoint: AgentMcpEndpointSchema,
  lastErrorCategory: AgentMcpLastErrorCategorySchema.nullable(),
};

export const agentMcpConnectionSelectSchema = createSelectSchema(
  agentMcpConnection,
  fieldRefinements,
);

export const agentMcpConnectionInsertSchema = createInsertSchema(
  agentMcpConnection,
  {
    ...fieldRefinements,
    lastErrorCategory: fieldRefinements.lastErrorCategory.optional(),
  },
);

export const agentMcpConnectionUpdateSchema = createUpdateSchema(
  agentMcpConnection,
  fieldRefinements,
).partial();

export const agentMcpConnectionMutableSchema =
  agentMcpConnectionUpdateSchema.pick({
    displayName: true,
    endpoint: true,
    authKind: true,
    enabled: true,
    toolPolicyMode: true,
  });
