import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { projectInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project.zod.js';

import { z } from 'zod';

export const CreateProjectSchema = z
  .object({
    key: projectInsertSchema.shape.key,
    name: projectInsertSchema.shape.name,
    description: projectInsertSchema.shape.description.optional(),
    leadUserId: projectInsertSchema.shape.leadUserId.optional(),
  })
  .meta({ id: 'CreateProject' });

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export class CreateProjectDto extends createZodDto(CreateProjectSchema) {}
