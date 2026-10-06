import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { projectUpdateSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project.zod.js';

import { z } from 'zod';

export const UpdateProjectSchema = projectUpdateSchema
  .pick({
    name: true,
    description: true,
    leadUserId: true,
  })
  .extend({
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
