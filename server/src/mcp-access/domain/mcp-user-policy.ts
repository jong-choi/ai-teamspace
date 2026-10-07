import { mcpUserPolicySelectSchema } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-user-policy.zod';

import type { z } from 'zod';

export type McpUserPolicy = z.infer<typeof mcpUserPolicySelectSchema>;
