import { agentMcpConnectionSelectSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.zod';

import { z } from 'zod';

export const AgentMcpConnectionSchema = agentMcpConnectionSelectSchema.meta({
  id: 'AgentMcpConnectionDomain',
});

export type AgentMcpConnection = z.infer<typeof AgentMcpConnectionSchema>;
