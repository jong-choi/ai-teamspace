import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationInvitationStatusSchema } from '#server/organizations/domain/organization-invitation.js';

import { z } from 'zod';

export const QueryOrganizationInvitationsSchema = z.object({
  status: OrganizationInvitationStatusSchema.default('pending'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryOrganizationInvitationsInput = z.infer<
  typeof QueryOrganizationInvitationsSchema
>;

export class QueryOrganizationInvitationsDto extends createZodDto(
  QueryOrganizationInvitationsSchema,
) {}
