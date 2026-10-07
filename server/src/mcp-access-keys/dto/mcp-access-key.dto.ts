import { createZodDto } from '@/common/dto/create-zod-dto';
import { McpScopesSchema } from '@/mcp/contracts/mcp-scope';
import {
  McpAccessKeyOrganizationGrantSchema,
  McpAccessKeyScopeRequestSchema,
} from '@/mcp-access-keys/domain/mcp-access-key-contract';

import { z } from 'zod';

const accessKeyNameSchema = z.string().trim().min(1).max(32);
const expiresInDaysSchema = z.number().int().positive();

export const CreateMcpAccessKeySchema = z.object({
  name: accessKeyNameSchema,
  scopes: McpAccessKeyScopeRequestSchema,
  organizationGrant: McpAccessKeyOrganizationGrantSchema,
  expiresInDays: expiresInDaysSchema.optional(),
});

export const UpdateMcpAccessKeySchema = z
  .object({
    name: accessKeyNameSchema.optional(),
    scopes: McpAccessKeyScopeRequestSchema.optional(),
    organizationGrant: McpAccessKeyOrganizationGrantSchema.optional(),
    enabled: z.boolean().optional(),
    expiresInDays: expiresInDaysSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: '하나 이상의 MCP access key 변경 필드가 필요합니다.',
  });

export const McpAccessKeySchema = z
  .object({
    id: z.string().min(1),
    name: accessKeyNameSchema,
    prefix: z.string().min(1),
    start: z.string().nullable(),
    enabled: z.boolean(),
    expired: z.boolean(),
    scopes: McpScopesSchema,
    organizationGrant: McpAccessKeyOrganizationGrantSchema,
    lastUsedAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'McpAccessKey' });

export const McpAccessKeySecretSchema = z
  .object({
    key: McpAccessKeySchema,
    secret: z.string().min(1),
  })
  .meta({ id: 'McpAccessKeySecret' });

export const QueryMcpAccessKeysSchema = z.object({
  status: z.enum(['enabled', 'disabled', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const McpAccessKeyListSchema = z
  .object({
    items: z.array(McpAccessKeySchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .meta({ id: 'McpAccessKeyList' });

export type CreateMcpAccessKeyInput = z.infer<typeof CreateMcpAccessKeySchema>;
export type UpdateMcpAccessKeyInput = z.infer<typeof UpdateMcpAccessKeySchema>;
export type QueryMcpAccessKeysInput = z.infer<typeof QueryMcpAccessKeysSchema>;
export type McpAccessKeyResponse = z.infer<typeof McpAccessKeySchema>;
export type McpAccessKeySecretResponse = z.infer<
  typeof McpAccessKeySecretSchema
>;

export class CreateMcpAccessKeyDto extends createZodDto(
  CreateMcpAccessKeySchema,
) {}

export class UpdateMcpAccessKeyDto extends createZodDto(
  UpdateMcpAccessKeySchema,
) {}

export class QueryMcpAccessKeysDto extends createZodDto(
  QueryMcpAccessKeysSchema,
) {}

export class McpAccessKeyDto extends createZodDto(McpAccessKeySchema) {}

export class McpAccessKeySecretDto extends createZodDto(
  McpAccessKeySecretSchema,
) {}

export class McpAccessKeyListDto extends createZodDto(McpAccessKeyListSchema) {}
