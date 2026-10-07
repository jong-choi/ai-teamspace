import { agentMcpCredentialSelectSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-credential.zod';

import { z } from 'zod';

export const AgentMcpCredentialSchema = agentMcpCredentialSelectSchema.meta({
  id: 'AgentMcpCredentialDomain',
});

export type AgentMcpCredential = z.infer<typeof AgentMcpCredentialSchema>;
