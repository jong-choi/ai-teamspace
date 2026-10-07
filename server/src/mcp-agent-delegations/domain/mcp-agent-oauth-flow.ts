import { mcpAgentOauthFlowSelectSchema } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-oauth-flow.zod';

import { z } from 'zod';

export const McpAgentOauthFlowSchema = mcpAgentOauthFlowSelectSchema;

export type McpAgentOauthFlow = z.infer<typeof McpAgentOauthFlowSchema>;
