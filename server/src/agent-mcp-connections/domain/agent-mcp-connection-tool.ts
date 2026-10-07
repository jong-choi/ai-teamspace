import { agentMcpConnectionToolSelectSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection-tool.zod';

import { z } from 'zod';

export const AgentMcpConnectionToolSchema =
  agentMcpConnectionToolSelectSchema.meta({
    id: 'AgentMcpConnectionToolDomain',
  });

export type AgentMcpConnectionTool = z.infer<
  typeof AgentMcpConnectionToolSchema
>;
