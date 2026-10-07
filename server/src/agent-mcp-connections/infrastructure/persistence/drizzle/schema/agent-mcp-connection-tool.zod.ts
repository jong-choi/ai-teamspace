import { agentMcpConnectionTool } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection-tool.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const fieldRefinements = {
  originalToolName: z.string().min(1).max(256),
  schemaFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
};

export const agentMcpConnectionToolSelectSchema = createSelectSchema(
  agentMcpConnectionTool,
  fieldRefinements,
);

export const agentMcpConnectionToolInsertSchema = createInsertSchema(
  agentMcpConnectionTool,
  {
    ...fieldRefinements,
    schemaFingerprint: fieldRefinements.schemaFingerprint.optional(),
  },
);

export const agentMcpConnectionToolUpdateSchema = createUpdateSchema(
  agentMcpConnectionTool,
  fieldRefinements,
).partial();

export const agentMcpConnectionToolPolicyInputSchema =
  agentMcpConnectionToolInsertSchema.pick({
    originalToolName: true,
    schemaFingerprint: true,
    enabled: true,
  });
