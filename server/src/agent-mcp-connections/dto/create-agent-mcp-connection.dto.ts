import { agentMcpConnectionInsertSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const CreateAgentMcpConnectionSchema = agentMcpConnectionInsertSchema
  .pick({
    displayName: true,
    endpoint: true,
    authKind: true,
  })
  .extend({
    bearerToken: z.string().min(1).max(16_384).optional(),
  })
  .superRefine((input, context) => {
    if (input.authKind === 'bearer' && !input.bearerToken) {
      context.addIssue({
        code: 'custom',
        path: ['bearerToken'],
        message: 'bearer 인증에는 token이 필요합니다.',
      });
    }
    if (input.authKind !== 'bearer' && input.bearerToken !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['bearerToken'],
        message: 'bearer token은 bearer 인증에서만 사용할 수 있습니다.',
      });
    }
  })
  .meta({ id: 'CreateAgentMcpConnection' });

export type CreateAgentMcpConnectionInput = z.infer<
  typeof CreateAgentMcpConnectionSchema
>;

export class CreateAgentMcpConnectionDto extends createZodDto(
  CreateAgentMcpConnectionSchema,
) {}
