import { agentMcpConnectionMutableSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const UpdateAgentMcpConnectionSchema = agentMcpConnectionMutableSchema
  .extend({
    expectedRevision: z.number().int().nonnegative(),
  })
  .refine(
    (input) =>
      input.displayName !== undefined ||
      input.endpoint !== undefined ||
      input.authKind !== undefined ||
      input.enabled !== undefined ||
      input.toolPolicyMode !== undefined,
    '수정할 external MCP connection 필드가 필요합니다.',
  )
  .meta({ id: 'UpdateAgentMcpConnection' });

export type UpdateAgentMcpConnectionInput = z.infer<
  typeof UpdateAgentMcpConnectionSchema
>;

export class UpdateAgentMcpConnectionDto extends createZodDto(
  UpdateAgentMcpConnectionSchema,
) {}
