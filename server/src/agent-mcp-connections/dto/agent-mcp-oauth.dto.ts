import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const AgentMcpOauthAuthorizationSchema = z
  .object({
    authorizationUrl: z.url(),
  })
  .meta({ id: 'AgentMcpOauthAuthorization' });

export type AgentMcpOauthAuthorizationResponse = z.infer<
  typeof AgentMcpOauthAuthorizationSchema
>;

export class AgentMcpOauthAuthorizationDto extends createZodDto(
  AgentMcpOauthAuthorizationSchema,
) {}
