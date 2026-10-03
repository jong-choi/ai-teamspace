import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationMemberSchema } from '#server/organizations/domain/organization-member.js';

export class OrganizationMemberDto extends createZodDto(
  OrganizationMemberSchema,
) {}
