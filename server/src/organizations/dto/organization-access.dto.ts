import { createZodDto } from '@/common/dto/create-zod-dto';
import { OrganizationAccessSchema } from '@/organizations/domain/organization-access';

export class OrganizationAccessDto extends createZodDto(
  OrganizationAccessSchema,
) {}
