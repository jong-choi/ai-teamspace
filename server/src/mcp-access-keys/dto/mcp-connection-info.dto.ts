import { createZodDto } from '@/common/dto/create-zod-dto';
import { McpScopesSchema } from '@/mcp/contracts/mcp-scope';

import { z } from 'zod';

export const McpConnectionInfoSchema = z
  .object({
    resourceUrl: z.url(),
    protocolVersion: z.literal('2026-07-28'),
    authMethods: z.array(z.enum(['oauth', 'personal-access-key'])).min(1),
    accessKey: z.object({
      prefix: z.string().min(1),
      maxActiveKeys: z.number().int().positive(),
      defaultExpiresInDays: z.number().int().positive(),
      maxExpiresInDays: z.number().int().positive(),
    }),
    scopes: McpScopesSchema,
  })
  .meta({ id: 'McpConnectionInfo' });

export type McpConnectionInfo = z.infer<typeof McpConnectionInfoSchema>;

export class McpConnectionInfoDto extends createZodDto(
  McpConnectionInfoSchema,
) {}
