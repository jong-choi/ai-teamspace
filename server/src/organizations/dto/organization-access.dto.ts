import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationAccessSchema } from '#server/organizations/domain/organization-access.js';

export class OrganizationAccessDto extends createZodDto(
  OrganizationAccessSchema,
) {}
