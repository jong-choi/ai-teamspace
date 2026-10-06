import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { projectInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project.zod.js';

import { z } from 'zod';

export const CreateProjectSchema = projectInsertSchema
  .pick({
    key: true,
    name: true,
    description: true,
    leadUserId: true,
  })
  .partial({ leadUserId: true })
  .meta({ id: 'CreateProject' });

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export class CreateProjectDto extends createZodDto(CreateProjectSchema) {}
