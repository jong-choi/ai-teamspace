import { createZodDto } from '@/common/dto/create-zod-dto';
import { McpScopesSchema } from '@/mcp/contracts/mcp-scope';

import { z } from 'zod';

export const McpAgentDelegationStatusSchema = z
  .object({
    status: z.enum([
      'not_connected',
      'pending_consent',
      'active',
      'refresh_required',
      'revoked',
      'forbidden',
      'no_membership',
    ]),
    grantedScopes: McpScopesSchema,
    expiresAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'McpAgentDelegationStatus' });

export const StartMcpAgentDelegationSchema = z.object({
  returnTo: z.string().regex(/^\/ai(?:\/[A-Za-z0-9_-]+)?$/u),
});

export const StartMcpAgentDelegationResponseSchema =
  McpAgentDelegationStatusSchema.extend({
    authorizationUrl: z.url().nullable(),
  }).meta({ id: 'StartMcpAgentDelegationResponse' });

export type McpAgentDelegationStatus = z.infer<
  typeof McpAgentDelegationStatusSchema
>;
export type StartMcpAgentDelegationInput = z.infer<
  typeof StartMcpAgentDelegationSchema
>;
export type StartMcpAgentDelegationResponse = z.infer<
  typeof StartMcpAgentDelegationResponseSchema
>;

export class McpAgentDelegationStatusDto extends createZodDto(
  McpAgentDelegationStatusSchema,
) {}

export class StartMcpAgentDelegationDto extends createZodDto(
  StartMcpAgentDelegationSchema,
) {}

export class StartMcpAgentDelegationResponseDto extends createZodDto(
  StartMcpAgentDelegationResponseSchema,
) {}
