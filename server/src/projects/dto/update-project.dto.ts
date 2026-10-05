import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { projectUpdateSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project.zod.js';

import { z } from 'zod';

export const UpdateProjectSchema = z
  .object({
    name: projectUpdateSchema.shape.name.optional(),
    description: projectUpdateSchema.shape.description.optional(),
    leadUserId: projectUpdateSchema.shape.leadUserId.optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.description !== undefined ||
      input.leadUserId !== undefined ||
      input.archived !== undefined,
    '수정할 프로젝트 필드가 필요합니다.',
  )
  .meta({ id: 'UpdateProject' });

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export class UpdateProjectDto extends createZodDto(UpdateProjectSchema) {}
