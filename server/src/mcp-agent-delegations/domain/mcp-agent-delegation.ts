import { mcpAgentDelegationSelectSchema } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-delegation.zod';

import { z } from 'zod';

export const McpAgentDelegationSchema = mcpAgentDelegationSelectSchema;

export type McpAgentDelegation = z.infer<typeof McpAgentDelegationSchema>;
