import { createZodDto } from '@/common/dto/create-zod-dto';
import { McpScopesSchema } from '@/mcp/contracts/mcp-scope';

import { z } from 'zod';

export const McpOAuthConnectionSchema = z
  .object({
    consentId: z.string().min(1),
    clientId: z.string().min(1),
    displayName: z.string().min(1),
    applicationType: z.enum(['web', 'native']).nullable(),
    publicClient: z.boolean(),
    scopes: McpScopesSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.literal('approved'),
  })
  .meta({ id: 'McpOAuthConnection' });

export const McpOAuthConnectionListSchema = z
  .object({
    items: z.array(McpOAuthConnectionSchema),
  })
  .meta({ id: 'McpOAuthConnectionList' });

export class McpOAuthConnectionDto extends createZodDto(
  McpOAuthConnectionSchema,
) {}

export class McpOAuthConnectionListDto extends createZodDto(
  McpOAuthConnectionListSchema,
) {}
