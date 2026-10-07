import { agentMcpOauthStateSelectSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-oauth-state.zod';

import { z } from 'zod';

export const AgentMcpOauthStateSchema = agentMcpOauthStateSelectSchema.meta({
  id: 'AgentMcpOauthStateDomain',
});

export type AgentMcpOauthState = z.infer<typeof AgentMcpOauthStateSchema>;
