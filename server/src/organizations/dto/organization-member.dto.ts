import { createZodDto } from '@/common/dto/create-zod-dto';
import { OrganizationMemberSchema } from '@/organizations/domain/organization-member';

export class OrganizationMemberDto extends createZodDto(
  OrganizationMemberSchema,
) {}
