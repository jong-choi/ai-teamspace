import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const SetActiveOrganizationSchema = z.object({
  organizationId: z.string().min(1).nullable(),
});

export type SetActiveOrganizationInput = z.infer<
  typeof SetActiveOrganizationSchema
>;

export class SetActiveOrganizationDto extends createZodDto(
  SetActiveOrganizationSchema,
) {}
