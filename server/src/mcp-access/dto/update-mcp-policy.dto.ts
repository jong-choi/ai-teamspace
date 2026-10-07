import { createZodDto } from '@/common/dto/create-zod-dto';
import { mcpOrganizationPolicyUpdateSchema } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-organization-policy.zod';
import { mcpUserPolicyUpdateSchema } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-user-policy.zod';

import { z } from 'zod';

const ExpectedRevisionSchema = z.number().int().nonnegative();

export const UpdateMcpUserPolicySchema = mcpUserPolicyUpdateSchema
  .pick({ requestedScopes: true })
  .required()
  .extend({ expectedRevision: ExpectedRevisionSchema })
  .meta({ id: 'UpdateMcpUserPolicy' });

export const UpdateMcpOrganizationPolicySchema =
  mcpOrganizationPolicyUpdateSchema
    .pick({ allowedScopes: true })
    .required()
    .extend({ expectedRevision: ExpectedRevisionSchema })
    .meta({ id: 'UpdateMcpOrganizationPolicy' });

export type UpdateMcpUserPolicyInput = z.infer<
  typeof UpdateMcpUserPolicySchema
>;
export type UpdateMcpOrganizationPolicyInput = z.infer<
  typeof UpdateMcpOrganizationPolicySchema
>;

export class UpdateMcpUserPolicyDto extends createZodDto(
  UpdateMcpUserPolicySchema,
) {}

export class UpdateMcpOrganizationPolicyDto extends createZodDto(
  UpdateMcpOrganizationPolicySchema,
) {}
