import { createZodDto } from '@/common/dto/create-zod-dto';
import { projectInsertSchema } from '@/projects/infrastructure/persistence/drizzle/schema/project.zod';

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
