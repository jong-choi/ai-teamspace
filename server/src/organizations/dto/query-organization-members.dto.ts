import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const QueryOrganizationMembersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryOrganizationMembersInput = z.infer<
  typeof QueryOrganizationMembersSchema
>;

export class QueryOrganizationMembersDto extends createZodDto(
  QueryOrganizationMembersSchema,
) {}
