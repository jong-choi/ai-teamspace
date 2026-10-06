import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const CreateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(255),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  logo: z.string().url().nullable().optional(),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

export class CreateOrganizationDto extends createZodDto(
  CreateOrganizationSchema,
) {}
